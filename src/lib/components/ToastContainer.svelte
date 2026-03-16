<script lang="ts">
  import { toasts, removeToast } from "../stores/toast";

  let dismissing = $state<Set<string>>(new Set());

  function handleDismiss(id: string) {
    dismissing = new Set([...dismissing, id]);
    setTimeout(() => {
      removeToast(id);
      dismissing = new Set([...dismissing].filter((d) => d !== id));
    }, 150);
  }
</script>

{#if $toasts.length > 0}
  <div class="toast-container">
    {#each $toasts as toast (toast.id)}
      <div class="toast toast-{toast.type}" class:dismissing={dismissing.has(toast.id)}>
        <span class="toast-message">{toast.message}</span>
        <button class="toast-close" onclick={() => handleDismiss(toast.id)}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    bottom: 40px;
    right: var(--space-4);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-width: 360px;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-lg);
    background: var(--bg-tertiary);
    color: var(--text-primary);
    font-size: var(--font-size-base);
    box-shadow: var(--shadow-popover);
    border: 1px solid var(--border-primary);
    animation: toast-in 200ms ease-out;
  }

  .toast.dismissing {
    animation: toast-out 150ms ease-in forwards;
  }

  .toast-error {
    border-left: 3px solid var(--color-error);
  }

  .toast-success {
    border-left: 3px solid var(--color-success);
  }

  .toast-info {
    border-left: 3px solid var(--color-info);
  }

  .toast-message {
    flex: 1;
  }

  .toast-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: var(--radius-sm);
    color: var(--text-tertiary);
    transition: all var(--transition-fast);
  }

  .toast-close:hover {
    background: rgba(255, 255, 255, 0.10);
    color: var(--text-primary);
  }

  .toast-close:active {
    background: rgba(255, 255, 255, 0.04);
  }

  @keyframes toast-in {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes toast-out {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
</style>
