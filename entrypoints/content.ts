import { scrapeCurrentPage, getLinkedInPageType } from '../utils/linkedin-scraper';
import type { CaptureState, LinkedInData, ExtensionResponse, TwentyPerson, TwentyCompany } from '../types';

// Content script CSS
const FLOATING_BUTTON_STYLES = `
  .twenty-capture-container {
    position: fixed;
    bottom: 24px;
    left: 24px;
    z-index: 99999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  }
  
  .twenty-btn-group {
    display: flex;
    align-items: stretch;
    border-radius: 24px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  
  .twenty-btn-group .twenty-capture-btn {
    border-radius: 24px;
  }
  
  .twenty-btn-group.has-menu .twenty-capture-btn {
    border-radius: 24px 0 0 24px;
  }
  
  .twenty-capture-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    border: none;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .twenty-btn-group:hover {
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  }
  
  .twenty-capture-btn--loading {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
    pointer-events: none;
  }
  
  .twenty-capture-btn--ready {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
  }
  
  .twenty-capture-btn--exists {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }
  
  .twenty-capture-btn--saving {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
    pointer-events: none;
  }
  
  .twenty-capture-btn--saved {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }
  
  .twenty-capture-btn--error {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    color: white;
  }
  
  .twenty-capture-btn--idle {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
  }
  
  .twenty-menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px 12px;
    border: none;
    border-left: 1px solid rgba(255,255,255,0.25);
    background: linear-gradient(135deg, #5558e6 0%, #7c5ce0 100%);
    color: white;
    cursor: pointer;
    font-size: 12px;
    font-weight: bold;
    letter-spacing: 1px;
    transition: filter 0.2s;
    border-radius: 0 24px 24px 0;
  }
  
  .twenty-menu-btn--exists {
    background: linear-gradient(135deg, #0d9668 0%, #047857 100%);
  }
  
  .twenty-menu-btn:hover {
    filter: brightness(0.9);
  }
  
  .twenty-capture-icon {
    width: 18px;
    height: 18px;
  }
  
  .twenty-capture-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: twenty-spin 0.8s linear infinite;
  }
  
  @keyframes twenty-spin {
    to { transform: rotate(360deg); }
  }
  
  .twenty-capture-toast {
    position: fixed;
    bottom: 80px;
    left: 24px;
    background: #1f2937;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
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
  
  /* Menu Dropdown */
  .twenty-menu-dropdown {
    position: absolute;
    bottom: 100%;
    left: 0;
    margin-bottom: 8px;
    background: white;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    min-width: 180px;
    overflow: hidden;
    animation: twenty-panel-in 0.15s ease;
  }
  
  .twenty-menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    font-size: 13px;
    color: #374151;
    cursor: pointer;
    transition: background 0.15s;
  }
  
  .twenty-menu-item:hover {
    background: #f3f4f6;
  }
  
  .twenty-menu-item svg {
    width: 16px;
    height: 16px;
    color: #6b7280;
  }

  /* Search Panel */
  .twenty-search-panel {
    position: fixed;
    bottom: 80px;
    left: 24px;
    width: 320px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    z-index: 100001;
    overflow: hidden;
    animation: twenty-panel-in 0.2s ease;
  }
  
  @keyframes twenty-panel-in {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  
  .twenty-search-header {
    padding: 12px 16px;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .twenty-search-title {
    font-size: 13px;
    font-weight: 600;
    color: #374151;
  }
  
  .twenty-search-close {
    background: none;
    border: none;
    cursor: pointer;
    color: #9ca3af;
    padding: 4px;
    display: flex;
  }
  
  .twenty-search-close:hover {
    color: #6b7280;
  }
  
  .twenty-search-input-wrap {
    padding: 12px 16px;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .twenty-search-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
  }
  
  .twenty-search-input:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }
  
  .twenty-search-results {
    max-height: 240px;
    overflow-y: auto;
  }
  
  .twenty-search-result {
    padding: 12px 16px;
    cursor: pointer;
    border-bottom: 1px solid #f3f4f6;
    transition: background 0.15s;
  }
  
  .twenty-search-result:hover {
    background: #f9fafb;
  }
  
  .twenty-search-result:last-child {
    border-bottom: none;
  }
  
  .twenty-search-result-name {
    font-size: 14px;
    font-weight: 500;
    color: #1f2937;
  }
  
  .twenty-search-result-sub {
    font-size: 12px;
    color: #6b7280;
    margin-top: 2px;
  }
  
  .twenty-search-empty {
    padding: 24px 16px;
    text-align: center;
    color: #9ca3af;
    font-size: 13px;
  }
  
  .twenty-search-loading {
    padding: 24px 16px;
    text-align: center;
    color: #6b7280;
    font-size: 13px;
  }
`;

// SVG Icons
const ICONS = {
  add: `<svg class="twenty-capture-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`,
  check: `<svg class="twenty-capture-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`,
  link: `<svg class="twenty-capture-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>`,
  error: `<svg class="twenty-capture-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>`,
  close: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  menu: `•••`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>`,
};

type SearchResult = {
  id: string;
  name: string;
  subtitle?: string;
  type: 'person' | 'company';
};

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
    let showMenuDropdown = false;
    let showSearchPanel = false;
    let searchQuery = '';
    let searchResults: SearchResult[] = [];
    let isSearching = false;
    let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    // DOM elements
    let container: HTMLDivElement | null = null;
    let styleEl: HTMLStyleElement | null = null;
    // Live reference to the search results list, so search updates can patch it
    // in place instead of rebuilding (and re-animating) the whole panel.
    let searchResultsEl: HTMLDivElement | null = null;
    
    // Initialize
    function init() {
      // Inject styles
      styleEl = document.createElement('style');
      styleEl.textContent = FLOATING_BUTTON_STYLES;
      document.head.appendChild(styleEl);
      
      // Create container for floating button
      container = document.createElement('div');
      container.id = 'twenty-capture-root';
      document.body.appendChild(container);
      
      // Initial render
      render();
      
      // Check for existing record after a short delay
      setTimeout(checkExisting, 2500);
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
          if (response.error?.includes('not configured') || response.error?.includes('No authentication')) {
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
    
    // Escape untrusted text (CRM/LinkedIn data) before inserting via innerHTML
    function escapeHtml(s: string): string {
      const div = document.createElement('div');
      div.textContent = s;
      return div.innerHTML;
    }

    // Patch only the results list. Rebuilding the whole panel on every keystroke
    // replays the entrance animation (visible flicker) and steals input focus.
    function populateSearchResults() {
      const resultsDiv = searchResultsEl;
      if (!resultsDiv) return;

      // Only show the loading state on the first query (nothing to show yet).
      // While refining a search, keep the current results visible to avoid a
      // flash between "Searching..." and the new list on every keystroke.
      if (isSearching && searchResults.length === 0) {
        resultsDiv.innerHTML = '<div class="twenty-search-loading">Searching...</div>';
      } else if (!isSearching && searchQuery && searchResults.length === 0) {
        resultsDiv.innerHTML = '<div class="twenty-search-empty">No contacts found</div>';
      } else if (searchResults.length > 0) {
        resultsDiv.innerHTML = '';
        searchResults.forEach((result) => {
          const item = document.createElement('div');
          item.className = 'twenty-search-result';
          item.innerHTML = `
            <div class="twenty-search-result-name">${escapeHtml(result.name)}</div>
            ${result.subtitle ? `<div class="twenty-search-result-sub">${escapeHtml(result.subtitle)}</div>` : ''}
          `;
          item.addEventListener('click', () => linkToRecord(result));
          resultsDiv.appendChild(item);
        });
      } else {
        resultsDiv.innerHTML = '<div class="twenty-search-empty">Type to search...</div>';
      }
    }

    // Search CRM for contacts
    async function searchCRM(query: string) {
      if (!query.trim()) {
        searchResults = [];
        populateSearchResults();
        return;
      }

      isSearching = true;
      populateSearchResults();

      try {
        const pageType = getLinkedInPageType(window.location.href);
        const response = await browser.runtime.sendMessage({
          type: 'SEARCH_RECORDS',
          payload: { query, type: pageType },
        }) as ExtensionResponse<SearchResult[]>;

        if (response.success && response.data) {
          searchResults = response.data;
        } else {
          searchResults = [];
        }
      } catch (error) {
        console.error('Error searching:', error);
        searchResults = [];
      }

      isSearching = false;
      populateSearchResults();
    }
    
    // Link to existing record and update it
    async function linkToRecord(record: SearchResult) {
      const data = state.data || scrapeCurrentPage();
      if (!data) {
        showToast('Could not extract profile data');
        return;
      }
      
      showSearchPanel = false;
      setState({ status: 'saving', data });
      
      try {
        const response = await browser.runtime.sendMessage({
          type: 'UPDATE_RECORD',
          payload: {
            id: record.id,
            type: record.type,
            data,
          },
        }) as ExtensionResponse<{ id: string }>;
        
        if (!response.success) {
          setState({ status: 'error', error: response.error, data });
          showToast(response.error || 'Failed to update');
          return;
        }
        
        setState({
          status: 'saved',
          existingRecord: {
            id: record.id,
            type: record.type,
          },
          data,
        });
        showToast(`Linked & updated ${record.name}!`);
        
        setTimeout(() => {
          if (state.status === 'saved') {
            setState({ ...state, status: 'exists' });
          }
        }, 2000);
      } catch (error) {
        console.error('Error updating record:', error);
        setState({ status: 'error', error: 'Failed to update', data });
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
    
    // Get button icon
    function getButtonIcon(): string {
      switch (state.status) {
        case 'loading':
        case 'saving':
          return '<div class="twenty-capture-spinner"></div>';
        case 'ready': return ICONS.add;
        case 'exists': return ICONS.link;
        case 'saved': return ICONS.check;
        case 'error': return ICONS.error;
        default: return ICONS.add;
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
    
    // Handle menu button click
    function handleMenuClick(e: Event) {
      e.stopPropagation();
      showMenuDropdown = !showMenuDropdown;
      showSearchPanel = false;
      render();
    }
    
    // Handle menu option selection
    function handleMenuOption(option: 'update' | 'link') {
      showMenuDropdown = false;
      
      if (option === 'update') {
        updateExistingRecord();
      } else if (option === 'link') {
        showSearchPanel = true;
        searchQuery = '';
        searchResults = [];
        render();
      }
    }
    
    // Update existing record with fresh LinkedIn data
    async function updateExistingRecord() {
      if (!state.existingRecord) return;
      
      const data = scrapeCurrentPage();
      if (!data) {
        showToast('Could not extract profile data');
        return;
      }
      
      const previousStatus = state.status;
      setState({ status: 'saving', data });
      
      try {
        const response = await browser.runtime.sendMessage({
          type: 'UPDATE_RECORD',
          payload: {
            id: state.existingRecord.id,
            type: state.existingRecord.type,
            data,
          },
        }) as ExtensionResponse<{ id: string }>;
        
        if (!response.success) {
          setState({ status: previousStatus, error: response.error, data });
          showToast(response.error || 'Failed to update');
          return;
        }
        
        setState({
          status: 'saved',
          existingRecord: state.existingRecord,
          data,
        });
        showToast('Updated from LinkedIn!');
        
        setTimeout(() => {
          if (state.status === 'saved') {
            setState({ ...state, status: 'exists' });
          }
        }, 2000);
      } catch (error) {
        console.error('Error updating record:', error);
        setState({ status: previousStatus, error: 'Failed to update', data });
      }
    }
    
    // Handle search input
    function handleSearchInput(e: Event) {
      const input = e.target as HTMLInputElement;
      searchQuery = input.value;
      
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        searchCRM(searchQuery);
      }, 300);
    }
    
    // Render function
    function render() {
      if (!container) return;

      // Any previous results node is about to be discarded; drop the stale ref.
      searchResultsEl = null;

      const wrapper = document.createElement('div');
      wrapper.className = 'twenty-capture-container';
      
      // Button group - show menu for 'ready' (link to existing) and 'exists' (update from LinkedIn)
      const hasMenu = state.status === 'ready' || state.status === 'exists';
      const btnGroup = document.createElement('div');
      btnGroup.className = `twenty-btn-group${hasMenu ? ' has-menu' : ''}`;
      
      // Main button
      const btn = document.createElement('button');
      btn.className = `twenty-capture-btn twenty-capture-btn--${state.status}`;
      btn.innerHTML = `${getButtonIcon()}<span>${getButtonText()}</span>`;
      btn.addEventListener('click', handleClick);
      btnGroup.appendChild(btn);
      
      // Menu button
      if (hasMenu) {
        const menuBtn = document.createElement('button');
        menuBtn.className = `twenty-menu-btn twenty-menu-btn--${state.status}`;
        menuBtn.textContent = ICONS.menu;
        menuBtn.title = 'More options';
        menuBtn.addEventListener('click', handleMenuClick);
        btnGroup.appendChild(menuBtn);
      }
      
      wrapper.appendChild(btnGroup);
      
      // Menu dropdown
      if (showMenuDropdown) {
        const dropdown = document.createElement('div');
        dropdown.className = 'twenty-menu-dropdown';
        
        if (state.status === 'exists') {
          // Update option when record exists
          const updateItem = document.createElement('button');
          updateItem.className = 'twenty-menu-item';
          updateItem.innerHTML = `${ICONS.refresh}<span>Update from LinkedIn</span>`;
          updateItem.addEventListener('click', () => handleMenuOption('update'));
          dropdown.appendChild(updateItem);
        }
        
        if (state.status === 'ready') {
          // Link to existing option when ready to add
          const linkItem = document.createElement('button');
          linkItem.className = 'twenty-menu-item';
          linkItem.innerHTML = `${ICONS.search}<span>Link to existing contact</span>`;
          linkItem.addEventListener('click', () => handleMenuOption('link'));
          dropdown.appendChild(linkItem);
        }
        
        wrapper.appendChild(dropdown);
      }
      
      // Search panel
      if (showSearchPanel) {
        const panel = document.createElement('div');
        panel.className = 'twenty-search-panel';
        
        // Header
        const header = document.createElement('div');
        header.className = 'twenty-search-header';
        header.innerHTML = `
          <span class="twenty-search-title">Link to existing contact</span>
        `;
        const closeBtn = document.createElement('button');
        closeBtn.className = 'twenty-search-close';
        closeBtn.innerHTML = ICONS.close;
        closeBtn.addEventListener('click', () => {
          showSearchPanel = false;
          render();
        });
        header.appendChild(closeBtn);
        panel.appendChild(header);
        
        // Search input
        const inputWrap = document.createElement('div');
        inputWrap.className = 'twenty-search-input-wrap';
        const input = document.createElement('input');
        input.className = 'twenty-search-input';
        input.type = 'text';
        input.placeholder = 'Search by name...';
        input.value = searchQuery;
        input.addEventListener('input', handleSearchInput);
        inputWrap.appendChild(input);
        panel.appendChild(inputWrap);
        
        // Results — built once here, then patched in place by populateSearchResults()
        const resultsDiv = document.createElement('div');
        resultsDiv.className = 'twenty-search-results';
        panel.appendChild(resultsDiv);
        searchResultsEl = resultsDiv;
        populateSearchResults();

        wrapper.appendChild(panel);

        // Focus input after render
        setTimeout(() => input.focus(), 50);
      }
      
      // Toast
      if (toastMessage) {
        const toastEl = document.createElement('div');
        toastEl.className = 'twenty-capture-toast';
        toastEl.textContent = toastMessage;
        wrapper.appendChild(toastEl);
      }
      
      container.innerHTML = '';
      container.appendChild(wrapper);
    }
    
    // Watch for URL changes (LinkedIn SPA navigation)
    let lastUrl = window.location.href;
    const urlObserver = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        console.log('URL changed to:', lastUrl);
        const pageType = getLinkedInPageType(lastUrl);
        if (pageType) {
          state = { status: 'idle', data: undefined, existingRecord: undefined, error: undefined };
          showMenuDropdown = false;
          showSearchPanel = false;
          render();
          setTimeout(checkExisting, 2500);
        }
      }
    });
    
    // Close dropdown when clicking outside
    function handleDocumentClick(e: Event) {
      const target = e.target as HTMLElement;
      if (!target.closest('.twenty-capture-container')) {
        if (showMenuDropdown) {
          showMenuDropdown = false;
          render();
        }
      }
    }
    
    // Initialize on load
    init();
    document.addEventListener('click', handleDocumentClick);
    
    // Start observing URL changes
    urlObserver.observe(document.body, { childList: true, subtree: true });
    
    // Cleanup on context invalidation
    ctx.onInvalidated(() => {
      console.log('Content script invalidated, cleaning up');
      urlObserver.disconnect();
      document.removeEventListener('click', handleDocumentClick);
      container?.remove();
      styleEl?.remove();
    });
  },
});
