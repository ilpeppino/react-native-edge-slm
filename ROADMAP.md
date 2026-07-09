react-native-edge-slm Roadmap

«Status: Living document

This roadmap represents the long-term vision for react-native-edge-slm. It is intended to communicate the project's direction rather than serve as a fixed delivery schedule. Priorities may evolve as the ecosystem, mobile AI runtimes, and community needs change.»

---

Vision

react-native-edge-slm aims to become the standard cross-platform SDK for running Small Language Models (SLMs) on edge devices with React Native.

The project focuses on one goal:

«Write your AI application once. Run it locally anywhere.»

Developers should not need to understand C++, JNI, JSI, Metal, NNAPI, Vulkan, GGUF, model lifecycle management, or platform-specific optimizations.

Instead, they interact with a single, stable JavaScript API while the SDK manages the complexity underneath.

---

Core Principles

Cross-platform First

The SDK is designed for both Android and iOS.

Applications should never need platform-specific inference logic.

Each runtime backend is responsible for leveraging the best acceleration available on the underlying platform while preserving a unified JavaScript API.

Examples include:

- Android (NNAPI, Vulkan, GPU)
- Apple (Metal, Core ML where applicable)

---

Runtime Agnostic

The public API must never depend on a particular inference engine.

Current and future backends may include:

- llama.cpp
- LiteRT-LM
- ONNX Runtime
- MLC LLM
- Additional community backends

Applications should be able to change runtime backends without changing application code.

---

Privacy First

- Local inference by default
- No bundled telemetry
- No bundled cloud services
- No vendor lock-in
- Developers choose where models are hosted

---

Developer Experience

The SDK should remove the complexity of:

- Native builds
- Model downloads
- Storage management
- Runtime lifecycle
- Streaming
- Device compatibility
- Benchmarking

Developers should focus on building AI-powered applications.

---

Version 0.1 – Foundation ✅

Core Runtime

- Runtime backend abstraction
- llama.rn backend
- GGUF support
- Model loading
- Model unloading
- Token streaming
- Generation cancellation

Model Management

- Model presets
- Model registry
- Download lifecycle
- Checksum verification
- Local storage management

Package

- Android support
- React Native New Architecture
- TypeScript API
- Documentation
- Example application

---

Version 0.2 – Cross-Platform Support

Expand the SDK into a fully cross-platform solution.

Apple Platform

- Native Swift implementation
- TurboModule support
- JSI support
- Metal acceleration where supported
- Background model loading
- Streaming
- Cancellation
- Memory pressure handling

Cross-Platform Consistency

- Shared JavaScript API
- Unified storage abstraction
- Unified download lifecycle
- Shared runtime management

---

Version 0.3 – Production Readiness

Make the SDK production-ready for commercial applications.

Downloads

- Resume interrupted downloads
- Pause and resume
- Background downloads
- Retry policies
- Download queue

Storage

- Model version management
- Update detection
- Storage statistics
- Cleanup utilities

Runtime

- Warm loading
- Context reuse
- Runtime diagnostics
- Improved error reporting

---

Version 0.4 – Device Intelligence

Allow the SDK to understand the device it runs on.

Hardware Detection

- RAM
- CPU
- GPU
- Android version
- iOS version
- NNAPI availability
- Metal availability
- Vulkan availability
- Battery status
- Thermal status

Smart Recommendations

Developers can ask:

const recommendation = await EdgeSLM.recommendModel();

The SDK provides:

- Recommended model
- Recommended quantization
- Estimated RAM usage
- Estimated throughput
- Compatibility score

---

Version 0.5 – Model Catalog

Provide a generic model catalog.

The SDK does not host models.

Instead it provides metadata about publicly available models.

Potential information:

- Model family
- Parameters
- Quantizations
- Context length
- License
- Recommended runtime
- Estimated memory usage
- Recommended devices

Potential providers include:

- Hugging Face
- Enterprise manifests
- Community registries

---

Version 0.6 – Multiple Runtime Backends

Expand backend support.

Potential implementations:

- llama.cpp
- LiteRT-LM
- ONNX Runtime
- MLC LLM

Applications continue using the same JavaScript API regardless of backend.

---

Version 0.7 – Vision Models

Support multimodal inference.

Capabilities may include:

- Image input
- Vision-language models
- OCR integration hooks
- Streaming multimodal responses

---

Version 0.8 – Embeddings

Support local embedding generation.

Example use cases:

- Local semantic search
- Offline RAG
- Recommendation systems
- Document similarity
- Vector search

---

Version 0.9 – Tool Calling

Allow models to invoke native functionality through controlled APIs.

Examples:

- Camera
- GPS
- Calendar
- Contacts
- File system
- Sensors

Applications remain responsible for permission handling and security policies.

---

Version 1.0 – Stable Platform

A complete SDK for Edge AI development.

Core capabilities:

- Runtime abstraction
- Cross-platform support
- Model management
- Downloads
- Device Intelligence
- Benchmarks
- Multiple runtime backends
- Vision
- Embeddings
- Tool calling

Stable public API.

Long-term support begins here.

---

Ecosystem Vision

The runtime is only the foundation.

The long-term ecosystem may include complementary projects.

react-native-edge-slm

Core runtime and lifecycle management.

---

react-native-edge-slm-ui

Reusable React Native components.

Examples:

- Chat UI
- Download manager
- Model selector
- Streaming output
- Runtime status
- Benchmark cards

---

react-native-edge-slm-benchmark

Cross-device benchmarking.

Measure:

- Tokens per second
- Warm-up time
- Memory usage
- Battery impact
- Thermal throttling

Community benchmark sharing may be introduced in the future using anonymous performance metadata only.

---

react-native-edge-slm-models

A metadata registry describing supported models.

The project intentionally does not host model binaries.

Instead it provides:

- Model metadata
- Runtime compatibility
- Licensing information
- Recommended quantizations
- Device recommendations

---

react-native-edge-slm-cli

Developer tooling.

Example:

npx create-edge-slm

Generate starter projects with recommended project structure and configuration.

---

Long-Term Vision

react-native-edge-slm is not intended to be "another React Native wrapper."

Its ambition is to become the foundational infrastructure for building privacy-first, cross-platform Edge AI applications.

Whether an application is a chatbot, a document assistant, an industrial tool, an educational app, or a healthcare platform, developers should be able to rely on the same runtime, lifecycle management, and cross-platform abstractions.

Success is measured not only by runtime performance, but by providing a stable, extensible, and developer-friendly foundation for the next generation of on-device AI applications.
