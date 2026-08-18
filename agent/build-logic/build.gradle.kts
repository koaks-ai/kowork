plugins {
    `kotlin-dsl`
}

dependencies {
    // Gradle 插件以制品形式引入，这样预编译脚本插件才能用 id 应用它们。
    // 版本统一来自共享的版本目录。
    implementation(libs.kotlin.gradlePlugin)
    implementation(libs.kotlin.serializationPlugin)
}
