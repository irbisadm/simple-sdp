import com.dylibso.chicory.build.time.compiler.Config
import com.dylibso.chicory.build.time.compiler.Generator
import com.dylibso.chicory.compiler.InterpreterFallback

buildscript {
    repositories {
        mavenCentral()
    }
    dependencies {
        classpath("com.dylibso.chicory:build-time-compiler:1.7.5")
    }
}

plugins {
    kotlin("jvm") version "2.4.21"
    kotlin("plugin.serialization") version "2.4.21"
    `java-library`
}

group = "dev.irbisadm"
version = "1.1.0"

kotlin {
    jvmToolchain(21)
    compilerOptions {
        // Android consumes JVM libraries; Java 11 bytecode is supported by AGP 7+
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_11)
    }
}

java {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
}

// simple-sdp.wasm (built by `yarn asbuild` in the repository root) is compiled to JVM
// bytecode at build time by the Chicory compiler. The result is plain classes, so it also
// runs on Android, where bytecode cannot be generated at run time.
val wasmFile = file("src/main/wasm/simple-sdp.wasm")
val chicoryDir = layout.buildDirectory.dir("generated/chicory")
val compileWasm by tasks.registering {
    inputs.file(wasmFile)
    outputs.dir(chicoryDir)
    doLast {
        val out = chicoryDir.get().asFile.toPath()
        out.toFile().deleteRecursively()
        val generator = Generator(
            Config.builder()
                .withWasmFile(wasmFile.toPath())
                .withName("dev.irbisadm.simplesdp.internal.SimpleSdpModule")
                .withTargetClassFolder(out.resolve("classes"))
                .withTargetSourceFolder(out.resolve("sources"))
                .withTargetWasmFolder(out.resolve("resources"))
                .withInterpreterFallback(InterpreterFallback.FAIL)
                .build()
        )
        generator.generateMetaWasm(generator.generateResources())
        generator.generateSources()
    }
}
val chicoryClasses = files(chicoryDir.map { it.dir("classes") }).builtBy(compileWasm)

sourceSets.main {
    java.srcDir(chicoryDir.map { it.dir("sources") })
    resources.srcDir(chicoryDir.map { it.dir("resources") })
    output.dir(chicoryDir.map { it.dir("classes") }, "builtBy" to compileWasm)
}
tasks.named("compileJava") { dependsOn(compileWasm) }
tasks.named("compileKotlin") { dependsOn(compileWasm) }
tasks.named("processResources") { dependsOn(compileWasm) }

dependencies {
    api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.12.0")
    implementation("com.dylibso.chicory:runtime:1.7.5")
    compileOnly(chicoryClasses)
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
    systemProperty("fixtures", rootDir.resolve("../../test/fixtures").absolutePath)
    systemProperty("wasm", wasmFile.absolutePath)
}
