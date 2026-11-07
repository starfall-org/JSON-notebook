import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Secrets are read locally at configuration time, never checked into Git.
// Both files live at the Flutter project root, one level above android/.
val releaseKeystore = rootProject.file("../release.jks")
val releaseEnv = rootProject.file("../.env")
val releaseProperties = Properties().apply {
    if (releaseEnv.isFile) {
        releaseEnv.inputStream().use { load(it) }
    }
}
val releasePropertyKeys = listOf("KEYSTORE_PASSWORD", "KEY_PASSWORD", "KEY_ALIAS")
val releaseSigningReady = releaseKeystore.isFile && releasePropertyKeys.all { key ->
    !releaseProperties.getProperty(key).isNullOrBlank()
}
if (!releaseSigningReady && gradle.startParameter.taskNames.any {
        it.contains("release", ignoreCase = true)
    }) {
    error("Release signing requires release.jks and KEYSTORE_PASSWORD, KEY_PASSWORD, KEY_ALIAS in .env")
}

android {
    namespace = "org.starfallorb.jsonnotebook"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "org.starfallorb.jsonnotebook"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (releaseSigningReady) {
            create("release") {
                storeFile = releaseKeystore
                storePassword = releaseProperties.getProperty("KEYSTORE_PASSWORD")
                keyAlias = releaseProperties.getProperty("KEY_ALIAS")
                keyPassword = releaseProperties.getProperty("KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            // Never use the debug signing key for production APKs.
            signingConfig = if (releaseSigningReady) {
                signingConfigs.getByName("release")
            } else {
                null
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
