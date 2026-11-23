package app.damarumble

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.content.ContentValues
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.webkit.JavascriptInterface
import android.widget.Toast
import java.io.File
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback

class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private lateinit var progress: ProgressBar
    private lateinit var errorView: LinearLayout
    private var hadError = false

    private val serverHost: String = Uri.parse(BuildConfig.SERVER_URL).host ?: ""

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Mantém a tela ligada durante as partidas
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val root = FrameLayout(this).apply {
            setBackgroundColor(getColor(R.color.bg))
        }

        web = WebView(this).apply {
            setBackgroundColor(getColor(R.color.bg))
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true          // localStorage (token de login)
                cacheMode = WebSettings.LOAD_DEFAULT
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                allowFileAccess = false
                allowContentAccess = false
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
            }
        }
        web.addJavascriptInterface(MasterBridge(), "MasterBridge")
        web.setDefaultFocusHighlightEnabled(false) // tira o quadro azul de foco ao tocar
        root.addView(web, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        ))

        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            visibility = View.GONE
        }
        root.addView(progress, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, (3 * resources.displayMetrics.density).toInt()
        ))

        errorView = buildErrorView()
        root.addView(errorView, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        ))

        setContentView(root)

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if ((uri.scheme == "https" || uri.scheme == "http") && uri.host == serverHost) return false
                openExternal(uri)
                return true
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                hadError = false
                progress.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView, url: String?) {
                progress.visibility = View.GONE
                if (!hadError && Uri.parse(url ?: "").host == serverHost) injectMaster(view)
                if (!hadError) {
                    errorView.visibility = View.GONE
                    web.visibility = View.VISIBLE
                }
            }

            override fun onReceivedError(
                view: WebView, request: WebResourceRequest, error: WebResourceError
            ) {
                if (request.isForMainFrame) showError()
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                // Evita crash do app se o processo do WebView morrer
                recreate()
                return true
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                progress.progress = newProgress
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl(BuildConfig.SERVER_URL)
    }

    /** Injeta o app master (assets/master.js) no site. O script é idempotente. */
    private fun injectMaster(view: WebView) {
        try {
            val js = assets.open("master.js").bufferedReader().use { it.readText() }
            view.evaluateJavascript(js, null)
        } catch (_: Exception) { }
    }

    /** Ponte JS: exportação do registro para o analisador. */
    inner class MasterBridge {
        @JavascriptInterface
        fun key(): String = BuildConfig.MASTER_KEY

        @JavascriptInterface
        fun save(name: String, body: String) {
            val safe = name.replace(Regex("[^A-Za-z0-9._-]"), "_")
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val cv = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, safe)
                        put(MediaStore.Downloads.MIME_TYPE, "application/json")
                        put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                    }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv)!!
                    contentResolver.openOutputStream(uri)!!.use { it.write(body.toByteArray()) }
                } else {
                    val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)!!
                    File(dir, safe).writeText(body)
                }
                runOnUiThread { Toast.makeText(this@MainActivity, "Registro salvo em Downloads: $safe", Toast.LENGTH_LONG).show() }
            } catch (e: Exception) {
                runOnUiThread { Toast.makeText(this@MainActivity, "Falha ao salvar: ${e.message}", Toast.LENGTH_LONG).show() }
            }
        }
    }

    private fun buildErrorView(): LinearLayout {
        val d = resources.displayMetrics.density
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(getColor(R.color.bg))
            setPadding((32 * d).toInt(), 0, (32 * d).toInt(), 0)
            visibility = View.GONE

            addView(TextView(context).apply {
                setText(R.string.error_title)
                setTextColor(getColor(R.color.gold))
                textSize = 24f
                gravity = Gravity.CENTER
            })
            addView(TextView(context).apply {
                setText(R.string.error_msg)
                setTextColor(Color.WHITE)
                textSize = 15f
                gravity = Gravity.CENTER
                setPadding(0, (12 * d).toInt(), 0, (24 * d).toInt())
            })
            addView(Button(context).apply {
                setText(R.string.retry)
                setOnClickListener {
                    hadError = false
                    errorView.visibility = View.GONE
                    web.visibility = View.VISIBLE
                    web.loadUrl(BuildConfig.SERVER_URL)
                }
            })
        }
    }

    private fun showError() {
        hadError = true
        progress.visibility = View.GONE
        web.visibility = View.INVISIBLE
        errorView.visibility = View.VISIBLE
    }

    private fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: ActivityNotFoundException) {
            // sem app para abrir: ignora
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onPause() {
        web.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }
}
