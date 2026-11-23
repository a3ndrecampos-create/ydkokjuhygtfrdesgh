plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.damarumble"
    compileSdk = 34

    defaultConfig {
        applicationId = "app.damarumble.master"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0-master"
        // URL do servidor (troque aqui se mudar o domínio)
        // Chave do modo mestre: deve ser igual à variável MASTER_KEY do servidor; se a chave tiver $, escreva \$ aqui (é ela que libera as mãos do dominó)
        buildConfigField("String", "MASTER_KEY", "\"V9#mQ7@xL2!pR8\$zK5\"")
        buildConfigField("String", "SERVER_URL", "\"https://damarumble.shardweb.app/\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Sem keystore configurada o release sai sem assinatura; use o debug para testes.
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.1")
}
