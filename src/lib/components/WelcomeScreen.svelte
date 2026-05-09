<script lang="ts">
  import { api } from "../ipc";
  import { loadFiles } from "$lib/stores/files";
  import { openFile } from "$lib/stores/editor";

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();
  let loading = $state(false);

  const features = [
    { icon: "\u{1F9E9}", title: "Template Composition", desc: "Build prompts from reusable fragments" },
    { icon: "\u{1F4CB}", title: "Git Versioning", desc: "Track every change automatically" },
    { icon: "\u{1F522}", title: "Token Counting", desc: "Know your cost before you send" },
    { icon: "\u{1F9EA}", title: "Prompt Testing", desc: "Run and compare prompt outputs" },
  ];

  async function handleGetStarted() {
    loading = true;
    try {
      const firstPath = await api.installSamples();
      await loadFiles();
      if (firstPath) {
        await openFile(firstPath);
      }
    } catch (err) {
      console.error("Failed to install samples:", err);
    }
    onclose();
  }

  async function handleSkip() {
    try {
      await api.updateConfig({ onboardingCompleted: true } as any);
    } catch (err) {
      console.error("Failed to update config:", err);
    }
    onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") handleSkip();
    if (e.key === "Enter") handleGetStarted();
  }
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label="Welcome to Promptcase" tabindex="-1" onkeydown={handleKeydown}>
  <div class="welcome">
    <div class="hero">
      <h1>Promptcase</h1>
      <p class="tagline">Manage, version, and compose LLM prompt templates</p>
    </div>

    <div class="features">
      {#each features as f}
        <div class="feature-card">
          <span class="feature-icon">{f.icon}</span>
          <div>
            <span class="feature-title">{f.title}</span>
            <span class="feature-desc">{f.desc}</span>
          </div>
        </div>
      {/each}
    </div>

    <div class="actions">
      <button class="btn-primary" onclick={handleGetStarted} disabled={loading}>
        {loading ? "Setting up…" : "Get Started"}
      </button>
      <button class="btn-skip" onclick={handleSkip}>Skip</button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 300;
  }
  :global([data-theme="light"]) .overlay {
    background: rgba(0, 0, 0, 0.35);
  }
  .welcome {
    width: 520px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-xl);
    padding: var(--space-8) var(--space-8) var(--space-6);
    box-shadow: var(--shadow-xl);
    text-align: center;
  }
  .hero h1 {
    font-size: 32px;
    font-weight: 300;
    letter-spacing: -0.03em;
    color: var(--text-primary);
    margin: 0 0 var(--space-2);
  }
  .tagline {
    color: var(--text-secondary);
    font-size: var(--font-size-md);
    margin: 0 0 var(--space-6);
  }
  .features {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
    margin-bottom: var(--space-6);
    text-align: left;
  }
  .feature-card {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
    padding: var(--space-3);
    background: var(--bg-quaternary);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-secondary);
  }
  .feature-icon {
    font-size: 20px;
    flex-shrink: 0;
    line-height: 1;
    margin-top: 2px;
  }
  .feature-title {
    display: block;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
    margin-bottom: 2px;
  }
  .feature-desc {
    display: block;
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
    line-height: 1.4;
  }
  .actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }
  .btn-primary {
    background: var(--accent);
    color: white;
    padding: var(--space-2) var(--space-6);
    border-radius: var(--radius-md);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-medium);
    transition: background var(--transition-base);
    min-width: 160px;
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }
  .btn-primary:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .btn-skip {
    background: none;
    color: var(--text-tertiary);
    font-size: var(--font-size-sm);
    padding: var(--space-1) var(--space-2);
    transition: color var(--transition-base);
  }
  .btn-skip:hover {
    color: var(--text-secondary);
  }
</style>
