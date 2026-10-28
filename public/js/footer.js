export const siteFooter = () => `<footer class="site-footer"><div class="site-footer-in">
  <div class="site-footer-brand">© ${new Date().getFullYear()} Menty</div>
  <nav class="site-footer-links" aria-label="Информация о Menty">
    <a href="/privacy" target="_blank" rel="noopener">Политика конфиденциальности</a>
    <a href="/terms" target="_blank" rel="noopener">Условия использования</a>
    <a href="https://t.me/menty_platform" target="_blank" rel="noopener noreferrer">@menty_platform</a>
  </nav>
</div></footer>`;

// Standalone legal pages use the same footer as the application routes.
document.querySelectorAll('[data-site-footer]').forEach((slot) => { slot.outerHTML = siteFooter(); });
