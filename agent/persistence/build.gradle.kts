plugins {
    id("kowork.kmp.macos.library")
    id("kowork.sqldelight")
}

group = "dev.kowork.agent"
version = "1.0.0-SNAPSHOT"

kotlin {
    sourceSets {
        commonMain.dependencies {
            implementation(project(":protocol"))
            implementation(libs.serialization.json)
            implementation(libs.sqldelight.runtime)
            implementation(libs.koaks.core)
            implementation(libs.koaks.json)
            implementation(libs.datetime)
        }
        jvmMain.dependencies {
            implementation(libs.sqldelight.jvmDriver)
        }
        macosArm64Main.dependencies {
            implementation(libs.sqldelight.nativeDriver)
        }
        commonTest.dependencies {
            implementation(libs.coroutines.test)
        }
        jvmTest.dependencies {
            implementation(libs.sqldelight.jvmDriver)
        }
        macosArm64Test.dependencies {
            implementation(libs.sqldelight.nativeDriver)
        }
    }
}

sqldelight {
    databases {
        create("AgentDatabase") {
            packageName.set("dev.kowork.persistence.db")
            verifyMigrations.set(true)
            schemaOutputDirectory.set(file("src/commonMain/sqldelight/databases"))
        }
    }
}
