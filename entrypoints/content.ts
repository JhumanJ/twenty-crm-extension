import { scrapeCurrentPage, getLinkedInPageType } from '../utils/linkedin-scraper';
import type { CaptureState, ExtensionResponse } from '../types';

// Content script CSS. The inline button itself has none: it is a copy of
// LinkedIn's own "More" button and keeps LinkedIn's classes.
const CONTENT_STYLES = `
  .twenty-capture-toast {
    position: fixed;
    bottom: 24px;
    left: 24px;
    background: #1f2937;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    font-size: 14px;
    z-index: 100000;
    animation: twenty-toast-in 0.3s ease;
  }

  @keyframes twenty-toast-in {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

// Attributes that tie the copied button to LinkedIn's own "More" menu
const LINKEDIN_BUTTON_ATTRIBUTES = [
  'id',
  'href',
  'componentkey',
  'aria-label',
  'aria-expanded',
  'aria-haspopup',
  'aria-controls',
  'data-view-name',
];

export default defineContentScript({
  matches: ['*://*.linkedin.com/in/*', '*://*.linkedin.com/company/*'],
  runAt: 'document_idle',

  main(ctx) {
    console.log('Twenty CRM content script loaded on:', window.location.href);

    // State
    let state: CaptureState = {
      status: 'idle',
      data: undefined,
      existingRecord: undefined,
      error: undefined,
    };
    let toastMessage: string | null = null;
    let toastTimeout: ReturnType<typeof setTimeout> | null = null;

    // DOM elements
    let container: HTMLDivElement | null = null;
    let styleEl: HTMLStyleElement | null = null;
    let inlineBtn: HTMLElement | null = null;
    let inlineLabel: HTMLElement | null = null;
    let inlineAnchor: Element | null = null;
    let inlinePlacementScheduled = false;

    // Initialize
    function init() {
      // Inject styles
      styleEl = document.createElement('style');
      styleEl.textContent = CONTENT_STYLES;
      document.head.appendChild(styleEl);

      // Create container for toasts
      container = document.createElement('div');
      container.id = 'twenty-capture-root';
      document.body.appendChild(container);

      // Initial render
      render();

      // Check for existing record after a short delay
      setTimeout(checkExisting, 1500);
    }

    // Check for existing record
    async function checkExisting() {
      const pageType = getLinkedInPageType(window.location.href);
      console.log('Checking page type:', pageType, 'URL:', window.location.href);

      if (!pageType) {
        console.log('Not a profile or company page');
        return;
      }

      setState({ status: 'loading' });

      // Scrape page data first for better duplicate matching
      const scrapedData = scrapeCurrentPage();
      console.log('Scraped data for duplicate check:', scrapedData);

      try {
        const response = await browser.runtime.sendMessage({
          type: 'CHECK_DUPLICATE',
          payload: {
            linkedinUrl: window.location.href.split('?')[0],
            pageType,
            scrapedData,
          },
        }) as ExtensionResponse<{ exists: boolean; record?: { id: string; type: string }; matchedBy?: string }>;

        console.log('Check duplicate response:', response);

        if (!response.success) {
          if (response.error?.includes('not configured') || response.error?.includes('No API key')) {
            setState({ status: 'idle', error: 'Configure Twenty URL in extension popup' });
          } else {
            setState({ status: 'error', error: response.error });
          }
          return;
        }

        if (response.data?.exists && response.data.record) {
          console.log('Found existing record, matched by:', response.data.matchedBy);
          setState({
            status: 'exists',
            existingRecord: {
              id: response.data.record.id,
              type: response.data.record.type as 'person' | 'company',
            },
          });
        } else {
          console.log('No duplicate found, ready to add');
          setState({
            status: 'ready',
            data: scrapedData || undefined,
          });
        }
      } catch (error) {
        console.error('Error checking existing:', error);
        setState({ status: 'error', error: 'Failed to check CRM' });
      }
    }

    // Handle capture button click
    async function handleCapture() {
      if (state.status !== 'ready') return;

      const data = state.data || scrapeCurrentPage();
      if (!data) {
        showToast('Could not extract profile data');
        return;
      }

      setState({ status: 'saving', data });

      try {
        const response = await browser.runtime.sendMessage({
          type: 'CREATE_RECORD',
          payload: data,
        }) as ExtensionResponse<{ id: string }>;

        console.log('Create record response:', response);

        if (!response.success) {
          setState({ status: 'error', error: response.error, data });
          showToast(response.error || 'Failed to save');
          return;
        }

        setState({
          status: 'saved',
          existingRecord: {
            id: response.data!.id,
            type: data.type,
          },
          data,
        });
        showToast('Added to Twenty CRM!');

        setTimeout(() => {
          if (state.status === 'saved') {
            setState({ ...state, status: 'exists' });
          }
        }, 2000);
      } catch (error) {
        console.error('Error creating record:', error);
        setState({ status: 'error', error: 'Failed to save', data });
      }
    }

    // Open record in Twenty
    async function openInTwenty() {
      if (!state.existingRecord) return;

      try {
        const response = await browser.runtime.sendMessage({
          type: 'GET_SETTINGS',
        }) as ExtensionResponse<{ twentyUrl: string }>;

        if (response.success && response.data?.twentyUrl) {
          const { id, type } = state.existingRecord;
          const url = `${response.data.twentyUrl}/object/${type}/${id}`;
          window.open(url, '_blank');
        }
      } catch (error) {
        console.error('Error opening in Twenty:', error);
      }
    }

    // Update state and re-render
    function setState(newState: Partial<CaptureState>) {
      state = { ...state, ...newState };
      render();
    }

    // Show toast notification
    function showToast(message: string) {
      toastMessage = message;
      render();

      if (toastTimeout) clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => {
        toastMessage = null;
        render();
      }, 3000);
    }

    // Get button text based on state
    function getButtonText(): string {
      switch (state.status) {
        case 'loading': return 'Checking...';
        case 'ready': return 'Add to Twenty';
        case 'exists': return 'Open in Twenty';
        case 'saving': return 'Saving...';
        case 'saved': return 'Saved!';
        case 'error': return state.error || 'Error';
        case 'idle':
        default: return 'Twenty CRM';
      }
    }

    // Handle button click
    function handleClick() {
      console.log('Button clicked, current state:', state.status);
      if (state.status === 'ready') {
        handleCapture();
      } else if (state.status === 'exists' || state.status === 'saved') {
        openInTwenty();
      } else if (state.status === 'error' || state.status === 'idle') {
        checkExisting();
      }
    }

    // Render function
    function render() {
      if (!container) return;

      container.innerHTML = '';

      // Toast
      if (toastMessage) {
        const toastEl = document.createElement('div');
        toastEl.className = 'twenty-capture-toast';
        toastEl.textContent = toastMessage;
        container.appendChild(toastEl);
      }

      renderInline();
    }

    function renderInline() {
      if (!inlineBtn || !inlineLabel) {
        placeInlineButton();
        return;
      }

      inlineLabel.textContent = getButtonText();
      inlineBtn.title = getButtonText();
      placeInlineButton();
    }

    function hasOwnText(element: Element): boolean {
      return !!element.textContent?.trim();
    }

    // Find LinkedIn's "More" button in the profile or company top card.
    // LinkedIn's CSS classes change often, so match on the label and text instead.
    function findMoreButton(): HTMLElement | null {
      const scope = document.querySelector('main') || document.body;
      const buttons = scope.querySelectorAll<HTMLElement>('button, [role="button"]');

      for (const button of buttons) {
        if (button === inlineBtn) continue;

        const label = button.getAttribute('aria-label')?.trim() || '';
        const text = button.textContent?.trim() || '';
        // Profiles show a "More" text button; company pages an icon labelled "More actions for <Company>"
        const isMore = /^more actions\b/i.test(label) || /^more$/i.test(text);

        // Skip hidden copies, such as the sticky header's actions before it slides in
        if (isMore && button.getClientRects().length > 0) {
          return button;
        }
      }

      return null;
    }

    // The "More" button usually sits inside one or more wrappers (dropdown, trigger).
    // Climb through single-child wrappers so the inline button becomes a sibling in the actions row.
    function getActionRowItem(button: HTMLElement): Element {
      let item: Element = button;
      while (item.parentElement && item.parentElement.childElementCount === 1 && item.parentElement !== document.body) {
        item = item.parentElement;
      }
      return item;
    }

    // Build the inline button as a copy of LinkedIn's "More" button, so it has
    // exactly the same look (classes, hover and focus styles) with our text.
    // On company pages "More" is an icon, so copy a text button from the same row instead.
    function createInlineButton(moreButton: HTMLElement, row: Element) {
      let template: HTMLElement = moreButton;
      if (!hasOwnText(moreButton)) {
        const textButton = Array.from(row.querySelectorAll<HTMLElement>('button, a'))
          .reverse()
          .find((el) => el !== moreButton && hasOwnText(el) && el.getClientRects().length > 0);
        if (textButton) template = textButton;
      }

      const button = template.cloneNode(true) as HTMLElement;
      LINKEDIN_BUTTON_ATTRIBUTES.forEach((attr) => button.removeAttribute(attr));
      button.querySelectorAll('svg, img').forEach((icon) => icon.remove());
      button.querySelectorAll('[id], [componentkey]').forEach((el) => {
        el.removeAttribute('id');
        el.removeAttribute('componentkey');
      });

      // The innermost element holding text is where the label goes
      const textElements = Array.from(button.querySelectorAll<HTMLElement>('*')).filter(
        (el) => el.childElementCount === 0 && hasOwnText(el)
      );
      let label = textElements[0] || null;
      textElements.slice(1).forEach((el) => el.remove());
      if (!label) {
        label = document.createElement('span');
        button.appendChild(label);
      }

      button.setAttribute('role', 'button');
      if (button.tagName === 'A') button.tabIndex = 0;
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleClick();
      });

      inlineBtn = button;
      inlineLabel = label;
      inlineLabel.textContent = getButtonText();
      inlineBtn.title = getButtonText();
    }

    function placeInlineButton() {
      // Nothing to do while the button still sits right before the same anchor
      if (inlineBtn && inlineAnchor?.isConnected && inlineBtn.nextElementSibling === inlineAnchor) return;

      const moreButton = findMoreButton();
      if (!moreButton) {
        inlineAnchor = null;
        return;
      }

      inlineAnchor = getActionRowItem(moreButton);
      const row = inlineAnchor.parentElement;
      if (!row) return;

      if (!inlineBtn) {
        createInlineButton(moreButton, row);
      }

      // Rows that space their buttons with a flex gap need no extra margin
      const hasGap = parseFloat(getComputedStyle(row).columnGap) > 0;
      inlineBtn!.style.marginRight = hasGap ? '' : '8px';
      row.insertBefore(inlineBtn!, inlineAnchor);
    }

    // LinkedIn re-renders the top card often; put the button back once per frame at most
    function scheduleInlinePlacement() {
      if (inlinePlacementScheduled) return;
      inlinePlacementScheduled = true;
      requestAnimationFrame(() => {
        inlinePlacementScheduled = false;
        placeInlineButton();
      });
    }

    // Watch for URL changes (LinkedIn SPA navigation)
    let lastUrl = window.location.href;
    const urlObserver = new MutationObserver(() => {
      scheduleInlinePlacement();

      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        console.log('URL changed to:', lastUrl);
        const pageType = getLinkedInPageType(lastUrl);
        if (pageType) {
          state = { status: 'idle', data: undefined, existingRecord: undefined, error: undefined };
          // Rebuild the inline button from the new page's own "More" button
          inlineBtn?.remove();
          inlineBtn = null;
          inlineLabel = null;
          inlineAnchor = null;
          render();
          setTimeout(checkExisting, 1500);
        }
      }
    });

    // Initialize on load
    init();

    // Start observing URL changes
    urlObserver.observe(document.body, { childList: true, subtree: true });

    // Cleanup on context invalidation
    ctx.onInvalidated(() => {
      console.log('Content script invalidated, cleaning up');
      urlObserver.disconnect();
      container?.remove();
      inlineBtn?.remove();
      styleEl?.remove();
    });
  },
});
