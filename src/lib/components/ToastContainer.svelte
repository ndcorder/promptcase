<script lang="ts">
  import { toasts, removeToast } from "../stores/toast";
</script>

{#if $toasts.length > 0}
  <div class="toast-container">
    {#each $toasts as toast (toast.id)}
      <div class="toast toast-{toast.type}">
        <span class="toast-message">{toast.message}</span>
        <button class="toast-close" onclick={() => removeToast(toast.id)}>
          &times;
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    bottom: 40px;
    right: 16px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 360px;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 6px;
    background: #27272a;
    color: #d4d4d8;
    font-size: 13px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    animation: toast-in 0.2s ease-out;
  }

  .toast-error {
    border-left: 3px solid #f87171;
  }

  .toast-success {
    border-left: 3px solid #34d399;
  }

  .toast-info {
    border-left: 3px solid #60a5fa;
  }

  .toast-message {
    flex: 1;
  }

  .toast-close {
    background: none;
    border: none;
    color: #71717a;
    cursor: pointer;
    font-size: 16px;
    padding: 0 2px;
    line-height: 1;
  }

  .toast-close:hover {
    color: #d4d4d8;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
