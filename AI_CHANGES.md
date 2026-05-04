# 🤖 AI Assistant — Changes and Setup

This document summarizes the AI-related changes in GlassKeep and explains how to configure the assistant with an OpenAI-compatible API.

The goal is to make AI **configurable and flexible**: users can connect a local private model, a self-hosted AI server, or a remote AI provider through a compatible API. The old embedded model was removed because it was not good enough for real use. For GlassKeep, the idea is simple: **if AI is enabled, it should be genuinely useful; otherwise it is better not to include it.**

---

## ✨ What changed

### 🧹 Embedded local AI removed

GlassKeep no longer ships with a small AI model built directly into the app.

Instead, GlassKeep now connects to an AI provider through an OpenAI-compatible Chat Completions API. The main intended setup is to use **your own local or private AI**, for example with:

- 🦙 **Ollama**;
- 🖥️ **Open WebUI**;
- 🧪 LM Studio;
- 🔌 LiteLLM;
- ☁️ OpenRouter, OpenAI, or another compatible provider.

➡️ This keeps the app lighter, cleaner, and lets each user choose a model that actually fits their hardware and privacy needs.

---

## 🧠 How AI works in GlassKeep

### 🔎 Global AI search

From the search bar, users can ask questions about their notes.

Simple examples:

```txt
find my backup procedure
how did I configure remote access?
summarize my notes about my home server
which note talks about my printer?
```

GlassKeep does **not** blindly send every note to the model. The backend first selects the relevant notes, then calls the AI only if useful context exists.

If no relevant note is found, the AI model is not called and GlassKeep directly returns a “not found” answer.

---

### 📌 Notes used as sources

AI answers can display the notes that were used as sources.

Internally, the model is asked to add a marker like:

```txt
[[NOTES:id1,id2]]
```

The backend then checks that these IDs really match notes that were included in the context. The marker is removed before the answer is shown.

➡️ This prevents the model from inventing sources or citing notes it did not actually receive.

---

### 🗒️ AI assistant on an open note

An open note can also have its own AI assistant.

It is used to discuss directly with the AI about the currently opened note:

```txt
Explain this note
Summarize this procedure
Turn this into clean steps
Adapt this command to my case
```

Main behavior:

- 💬 the discussion is linked to the opened note;
- 🔒 it does not automatically search through all notes;
- 🧽 by default, closing the panel clears the temporary history;
- 💾 a save button can keep the history so the discussion can be resumed later on the same note;
- 🗑️ a delete button can remove the saved history.

---

## ⚙️ Administrator configuration

The administrator controls whether AI can be used on the whole GlassKeep instance.

In the Admin panel, the administrator can:

- ✅ allow or disable AI for the entire instance;
- 🌐 configure a server-side AI provider;
- 🔑 add an API key if needed;
- 🧠 choose the model;
- 🎚️ set temperature and max tokens;
- 🧪 test the connection.

Once AI is allowed on the instance, the administrator can choose between two approaches:

1. **Share the server model with users**  
   Users can use the AI configured by the administrator without seeing the API key, base URL, or full configuration.

2. **Do not share the server model**  
   AI remains available on the instance, but each user must configure their own OpenAI-compatible model.

---

## 👤 User configuration

Each user can enable the AI assistant in their own settings, as long as the administrator allows AI on the instance.

Two modes are available:

### 🏠 Server AI

The user uses the model configured by the administrator, only if the administrator made it available to users.

### 🔧 My own AI

The user configures their own OpenAI-compatible endpoint:

- base URL;
- model name;
- personal API key if needed;
- temperature;
- max tokens.

Only one AI configuration is used per request: **server** or **personal**, never both.

---

## 🚀 Recommended setup: Ollama + Open WebUI

I strongly recommend using **Ollama with Open WebUI**.

This is the setup used to test the AI integration.

Why this setup is practical:

- 🦙 Ollama makes local model management simple;
- 🖥️ Open WebUI provides a clean interface;
- 🔑 Open WebUI can generate API keys;
- 🔌 GlassKeep can call Open WebUI as an OpenAI-compatible API;
- 🏠 everything can stay local if Ollama and Open WebUI run on your server, NAS, or local network.

---

## 🌐 Base URLs

GlassKeep automatically appends:

```txt
/chat/completions
```

to the configured base URL.

Do **not** include `/chat/completions` in the `Base URL` field.

### ✅ Recommended: Open WebUI

Open WebUI usually exposes a complete endpoint like:

```txt
http://SERVER:PORT/api/chat/completions
```

In GlassKeep, enter only:

```txt
Base URL : http://SERVER:PORT/api
API key  : API key generated in Open WebUI
Model    : exact model name shown in Open WebUI
```

Example:

```txt
Base URL : http://192.168.1.50:3000/api
API key  : your Open WebUI API key
Model    : qwen3:4b-instruct-2507-q4_K_M
```

### ✅ Direct Ollama

You can also call Ollama directly:

```txt
Base URL : http://SERVER:11434/v1
API key  : empty, or any value if your setup requires one
Model    : qwen3:4b-instruct-2507-q4_K_M
```

For a cleaner setup with API keys and a management UI, **Open WebUI is still recommended**.

### 🐳 Docker note

If GlassKeep and your AI provider (Ollama, Open WebUI, etc.) both run on the same host, `localhost` from inside the container points to the container itself, not the host. Use:

- **Mac / Windows**: `http://host.docker.internal:PORT` (e.g. `http://host.docker.internal:11434/v1`)
- **Linux**: `http://HOST_IP:PORT` (e.g. `http://192.168.1.50:11434/v1`), or add `--add-host=host.docker.internal:host-gateway` to the container and use the Mac/Windows URL

---

## 🧩 Recommended models

GlassKeep does not need a huge model. However, very small models should be avoided: an AI that runs but answers poorly creates a bad experience.

### 🟢 Recommended minimum

```bash
ollama pull qwen3:4b-instruct-2507-q4_K_M
```

This is the minimum model I recommend for GlassKeep.

It is balanced enough for **CPU-only** usage while still being coherent enough to:

- understand notes;
- follow instructions;
- summarize or rewrite content;
- help with technical notes;
- stay grounded in the provided context.

Real-world test: this model was tested in **CPU-only** mode on a **Ryzen 7 3700X** with around **8 GB of RAM total while running GlassKeep**, and it was clearly usable for this kind of note assistant.

---

### 🔵 Better model

```bash
ollama pull qwen2.5:14b
```

This model gives better answers, but it is much heavier.

It may run in CPU-only mode depending on the machine, but for a comfortable experience, a **GPU is strongly recommended**.

Use it if you want better quality and your server has the required resources.

---

### 🟣 Larger models

Any model stronger than the ones above can improve answer quality if the machine can handle it.

Simple rule:

```txt
The larger the model, the better the answers can be,
but the more RAM, VRAM, or CPU power it will require.
```

---

### 🔴 Models that are too small

I do not recommend very small models as the main model:

```txt
qwen3:0.6b
qwen3:1.7b
gemma3:1b
llama3.2:1b
```

They can be useful to test a connection, but they are likely too weak for a good GlassKeep assistant experience.

---

## 🛠️ Suggested settings

Good starting values:

```txt
Temperature : 0.1 to 0.3
Max tokens  : 700 to 1200
Context     : 4096 to 8192 tokens
```

Even if some models support very large context windows, it is not necessary to send a huge amount of text. GlassKeep already selects relevant notes before calling the AI.

---

## 🔐 Privacy

Notes sent to a remote AI provider leave your GlassKeep instance.

If you use a remote API such as OpenAI, OpenRouter, or another external provider, the notes needed to answer the question will be sent to that service. For non-sensitive notes, that may be acceptable. For notes containing sensitive data, it is strongly recommended to avoid remote APIs and use a local/private AI setup instead.

To keep your data under your control, prefer:

- 🦙 local Ollama;
- 🖥️ local Open WebUI;
- 🏠 an AI server on your LAN;
- 🔐 a private remote server that you control.

The server AI configured by the administrator can be shared with users without exposing the API key or the full configuration.

---

## 🧪 Quick commands

Install the recommended model:

```bash
ollama pull qwen3:4b-instruct-2507-q4_K_M
```

Test it directly in Ollama:

```bash
ollama run qwen3:4b-instruct-2507-q4_K_M
```

Install the stronger model:

```bash
ollama pull qwen2.5:14b
```
