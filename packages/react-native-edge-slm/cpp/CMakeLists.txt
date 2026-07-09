# CMakeLists.txt — SCAFFOLD for the self-hosted llama.cpp backend.
#
# This is not built by the package today. It documents the intended native build. To activate:
#   1. Add llama.cpp as a git submodule at cpp/llama.cpp (pin a known-good tag).
#   2. Reference this file from android/build.gradle via android.externalNativeBuild.cmake.path
#      (and an equivalent build phase in the podspec for iOS).
#   3. Implement the JNI/JSI bridge in rn_local_ai_llama.cpp.
#
# See docs/cpp-backend.md for the full plan and build matrix.

cmake_minimum_required(VERSION 3.22)
project(rn_local_ai LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# --- llama.cpp (vendored as a submodule) ---------------------------------------------------
# Pin an exact tag in the submodule; do not track a moving branch.
set(LLAMA_BUILD_TESTS   OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER  OFF CACHE BOOL "" FORCE)

# Uncomment once the submodule exists:
# add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/llama.cpp ${CMAKE_CURRENT_BINARY_DIR}/llama.cpp)

# --- our shared library --------------------------------------------------------------------
add_library(rn_local_ai SHARED
  rn_local_ai_llama.cpp
)

target_include_directories(rn_local_ai PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}
  # ${CMAKE_CURRENT_SOURCE_DIR}/llama.cpp
  # ${CMAKE_CURRENT_SOURCE_DIR}/llama.cpp/include
)

# On Android, link the log lib and (once added) llama.
if(ANDROID)
  find_library(log-lib log)
  target_link_libraries(rn_local_ai ${log-lib})
endif()

# target_link_libraries(rn_local_ai llama)
