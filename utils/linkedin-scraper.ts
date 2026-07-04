import type { LinkedInProfileData, LinkedInCompanyData, LinkedInData } from '../types';

// Detect page type from URL
export function getLinkedInPageType(url: string): 'person' | 'company' | null {
  if (url.includes('linkedin.com/in/')) {
    return 'person';
  }
  if (url.includes('linkedin.com/company/')) {
    return 'company';
  }
  return null;
}

// Extract LinkedIn profile identifier from URL
export function getLinkedInIdentifier(url: string): string | null {
  const personMatch = url.match(/linkedin\.com\/in\/([^/?]+)/);
  if (personMatch) return personMatch[1];
  
  const companyMatch = url.match(/linkedin\.com\/company\/([^/?]+)/);
  if (companyMatch) return companyMatch[1];
  
  return null;
}

// Resolve the profile's display name from the most stable sources available.
// Visible <h1> first (structural, class-independent), then the page title and
// og:title meta as resilient fallbacks for when LinkedIn reshuffles the DOM.
function getProfileName(): string {
  const h1 =
    document.querySelector('main h1') ||
    document.querySelector('h1.text-heading-xlarge') || // legacy
    document.querySelector('h1[class*="break-words"]') ||
    document.querySelector('.pv-top-card h1') ||
    document.querySelector('h1'); // last resort: first heading on the page
  const fromH1 = h1?.textContent?.trim() || '';
  if (fromH1) return fromH1;

  // Page title, e.g. "(3) John Doe | LinkedIn" -> "John Doe"
  const fromTitle = document.title
    .replace(/^\(\d+\+?\)\s*/, '')          // strip notification count
    .replace(/\s*\|\s*LinkedIn\b.*$/i, '')  // strip "| LinkedIn ..."
    .trim();
  if (fromTitle && !/^linkedin$/i.test(fromTitle)) return fromTitle;

  // og:title meta, e.g. "John Doe - Title - Company | LinkedIn" -> "John Doe"
  const og = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
  return og.split(/\s+[|–—-]\s+/)[0].trim();
}

// Modern LinkedIn obfuscates every class name, so we anchor on stable, semantic
// landmarks instead. The "Contact info" link (a stable URL fragment) lives in the
// location row; that row's parent is the info block that also holds the headline
// and the "Company · School" line as sibling <p>s.
function getInfoBlock(): Element | null {
  const contactLink = document.querySelector('a[href*="contact-info"]');
  const locationRow = contactLink?.closest('div');
  return locationRow?.parentElement || null;
}

// Direct <p> children of the info block, in document order:
//   [0] = headline, [1] = "Company · School" (when present).
function infoBlockParagraphs(block: Element | null): string[] {
  if (!block) return [];
  return Array.from(block.children)
    .filter((c) => c.tagName === 'P')
    .map((p) => p.textContent?.trim() || '')
    .filter(Boolean);
}

// Headline / current role shown under the name.
function getHeadline(block: Element | null): string {
  // Legacy LinkedIn (still served in some locales / older instances)
  const legacy =
    document.querySelector('div[data-generated-suggestion-target]') ||
    document.querySelector('.text-body-medium.break-words') ||
    document.querySelector('.text-body-medium');
  const fromLegacy = legacy?.textContent?.trim() || '';
  if (fromLegacy) return fromLegacy;

  // Modern: first <p> of the info block
  return infoBlockParagraphs(block)[0] || '';
}

// Location line (e.g. "Singapore"): the first non-separator <p> in the same row
// as the Contact info link.
function getLocation(): string {
  const contactLink = document.querySelector('a[href*="contact-info"]');
  const locationRow = contactLink?.closest('div');
  if (locationRow) {
    for (const p of Array.from(locationRow.querySelectorAll(':scope > p'))) {
      const text = p.textContent?.trim() || '';
      if (text && text !== '·' && !/contact info/i.test(text)) return text;
    }
  }

  // Legacy fallback
  const legacy = document.querySelector(
    'span.text-body-small.inline.t-black--light.break-words'
  );
  return legacy?.textContent?.trim() || '';
}

// Current company. The modern profile renders it as an entity button whose
// figure carries an <svg id="company-accent-…">; the company name is the <p>
// inside that button. Falls back to the "Company · School" line, then legacy.
function getCurrentCompany(block: Element | null): { name: string; linkedinUrl?: string } | null {
  const companySvg = document.querySelector('[role="button"] svg[id*="company"]');
  const companyBtn = companySvg?.closest('[role="button"]');
  const btnName = companyBtn?.querySelector('p')?.textContent?.trim();
  if (btnName) {
    const link = companyBtn?.querySelector('a[href*="/company/"]');
    const href = link?.getAttribute('href') || '';
    const match = href.match(/\/company\/([^/?]+)/);
    return {
      name: btnName,
      linkedinUrl: match ? `https://www.linkedin.com/company/${match[1]}/` : undefined,
    };
  }

  // Fallback: the "Company · School" paragraph -> take the part before "·"
  const companyLine = infoBlockParagraphs(block)[1];
  if (companyLine) {
    const company = companyLine.split('·')[0].trim();
    if (company) return { name: company };
  }

  // Legacy aria-label based detection (older LinkedIn)
  return scrapeCurrentCompanyFromProfile();
}

// Scrape person profile data from LinkedIn page
export function scrapePersonProfile(): LinkedInProfileData | null {
  try {
    const linkedinUrl = window.location.href.split('?')[0];
    
    // Get name. Class names churn constantly, so prefer structural selectors and
    // fall back to the page title / og:title, which are far more stable.
    const fullName = getProfileName();

    if (!fullName) {
      const h1s = Array.from(document.querySelectorAll('h1'))
        .map((h) => h.textContent?.trim())
        .filter(Boolean);
      console.warn(
        'Could not extract profile name. h1 candidates:', h1s,
        '| document.title:', document.title
      );
      return null;
    }
    console.log('Scraped name:', fullName);
    const nameParts = parseFullName(fullName);

    // The info block (headline + company line + location) anchored on the
    // stable "Contact info" link rather than obfuscated class names.
    const infoBlock = getInfoBlock();

    const headline = getHeadline(infoBlock);
    if (!headline) {
      console.warn('Could not extract headline. Info block <p> candidates:',
        infoBlockParagraphs(infoBlock));
    }
    console.log('Scraped headline:', headline);

    // Get current company info
    const companyData = getCurrentCompany(infoBlock);
    const currentCompany = companyData?.name || extractCompanyFromHeadline(headline);
    console.log('Scraped company data:', companyData);
    console.log('Current company:', currentCompany);

    // Get profile image - prefer the owner's photo (alt matches their name)
    const profileImageUrl = scrapeProfileImage(fullName);

    // Get location
    const location = getLocation();
    if (!location) {
      console.warn('Could not extract location. Contact-info anchor present:',
        !!document.querySelector('a[href*="contact-info"]'));
    }
    console.log('Scraped location:', location);
    
    const result = {
      type: 'person' as const,
      linkedinUrl,
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      headline,
      currentCompany,
      currentCompanyLinkedInUrl: companyData?.linkedinUrl,
      profileImageUrl: profileImageUrl || undefined,
      location: location || undefined,
    };
    
    console.log('Scraped profile data:', {
      fullName,
      firstName: result.firstName,
      lastName: result.lastName,
      headline: result.headline,
    });
    
    return result;
  } catch (error) {
    console.error('Error scraping person profile:', error);
    return null;
  }
}

// Scrape the profile owner's photo. On modern LinkedIn many "profile-displayphoto"
// images belong to OTHER people (mutual connections), so we match on the owner's
// name in alt/title first; those decorative images have empty alt.
function scrapeProfileImage(fullName: string): string {
  const isOwnerPhoto = (img: HTMLImageElement | null): boolean =>
    !!img?.src && !img.src.includes('ghost') &&
    /licdn\.com|profile-displayphoto|profile-photo/i.test(img.src);

  // 1. Modern: the owner's photo is wrapped in an element labelled "Profile photo"
  //    (the cover photo and mutual-connection thumbnails are not).
  const labelled = document.querySelector('[aria-label="Profile photo"] img') as HTMLImageElement | null;
  if (isOwnerPhoto(labelled)) {
    console.log('Scraped profile image (labelled):', labelled!.src);
    return labelled!.src;
  }
  const topcard = document.querySelector('a[componentkey*="topcard-logo-image"] img') as HTMLImageElement | null;
  if (isOwnerPhoto(topcard)) {
    console.log('Scraped profile image (topcard):', topcard!.src);
    return topcard!.src;
  }

  // 2. The owner's photo may carry their name in alt/title
  if (fullName) {
    const nameImg = Array.from(document.querySelectorAll('img'))
      .find((img) => {
        const label = `${img.getAttribute('alt') || ''} ${img.getAttribute('title') || ''}`;
        return label.toLowerCase().includes(fullName.toLowerCase()) && isOwnerPhoto(img);
      });
    if (nameImg) {
      console.log('Scraped profile image (by name):', nameImg.src);
      return nameImg.src;
    }
  }

  // 3. Legacy selectors
  const selectors = [
    '.pv-top-card-profile-picture__container img',
    '.pv-top-card-profile-picture__image',
    'img.profile-photo-edit__preview',
    '.pv-top-card__photo img',
    'button[aria-label*="image"] img',
  ];
  for (const selector of selectors) {
    const img = document.querySelector(selector) as HTMLImageElement;
    if (isOwnerPhoto(img)) {
      console.log('Scraped profile image (legacy):', img.src);
      return img.src;
    }
  }

  return '';
}

// Scrape company info from current profile page
function scrapeCurrentCompanyFromProfile(): { name: string; linkedinUrl?: string; logoUrl?: string } | null {
  try {
    // Best method: Find button with aria-label containing "Entreprise actuelle" or "Current company"
    // This button contains company name, logo, and links to company page
    const companyButton = 
      document.querySelector('button[aria-label*="Entreprise actuelle"]') ||
      document.querySelector('button[aria-label*="Current company"]') ||
      document.querySelector('button[aria-label*="Empresa actual"]') ||  // Spanish
      document.querySelector('button[aria-label*="Aktuelles Unternehmen"]');  // German
    
    if (companyButton) {
      // Extract company name from aria-label (format: "Entreprise actuelle: CompanyName. ...")
      const ariaLabel = companyButton.getAttribute('aria-label') || '';
      const nameMatch = ariaLabel.match(/:\s*([^.]+)/);
      const name = nameMatch ? nameMatch[1].trim() : '';
      
      // Get company logo URL
      const logoImg = companyButton.querySelector('img');
      const logoUrl = logoImg?.src || undefined;
      
      // Try to get company LinkedIn URL from nearby link or page navigation
      // The button itself doesn't have the URL, but we can try to find it elsewhere
      let linkedinUrl: string | undefined;
      
      if (name) {
        console.log('Found company from button:', { name, logoUrl });
        return { name, linkedinUrl, logoUrl };
      }
    }
    
    // Fallback: Try to find company link in the experience section or top card
    const companyLink = 
      document.querySelector('.pv-text-details__right-panel-item-text a[href*="/company/"]') ||
      document.querySelector('a[data-field="experience_company_logo"]') ||
      document.querySelector('.experience-item a[href*="/company/"]');
    
    if (companyLink) {
      const href = companyLink.getAttribute('href') || '';
      const match = href.match(/\/company\/([^/?]+)/);
      const linkedinUrl = match ? `https://www.linkedin.com/company/${match[1]}/` : undefined;
      
      const name = companyLink.textContent?.trim() || 
        companyLink.closest('.pv-text-details__right-panel-item-text')?.textContent?.trim() ||
        '';
      
      if (name) {
        return { name, linkedinUrl };
      }
    }
    
    // Last fallback: just get company name without URL
    const companyElement = 
      document.querySelector('.pv-text-details__right-panel-item-text') ||
      document.querySelector('[aria-label*="Current company"]');
    
    if (companyElement) {
      return { name: companyElement.textContent?.trim() || '' };
    }
    
    return null;
  } catch (error) {
    console.error('Error scraping company from profile:', error);
    return null;
  }
}

// Scrape company page data from LinkedIn
export function scrapeCompanyPage(): LinkedInCompanyData | null {
  try {
    const linkedinUrl = window.location.href.split('?')[0];

    // Company name — try DOM selectors then page title fallback
    const nameElement =
      document.querySelector('h1.org-top-card-summary__title') ||
      document.querySelector('h1[class*="org-top-card"]') ||
      document.querySelector('.org-top-card-primary-content__name') ||
      document.querySelector('h1[data-anonymize="company-name"]') ||
      document.querySelector('main h1') ||
      document.querySelector('h1');

    let name = nameElement?.textContent?.trim() || '';

    // Fallback: LinkedIn company pages set <title> to "CompanyName: Overview | LinkedIn"
    if (!name) {
      const titleMatch = document.title.match(/^([^:|]+?)(?:\s*[:|])/);
      if (titleMatch) {
        name = titleMatch[1].trim();
        console.log('Got company name from page title:', name);
      }
    }

    if (!name) {
      console.warn('Could not find company name element');
      return null;
    }

    // Industry and employee count — parse all info-item elements together
    const infoItems = document.querySelectorAll(
      '.org-top-card-summary-info-list__info-item, .org-top-card-summary__info-item'
    );
    let industry = '';
    let employeeCount = '';
    infoItems.forEach((el) => {
      const text = el.textContent?.trim() || '';
      if (text.match(/\d[\d,]+-[\d,]+/) || text.toLowerCase().includes('employee')) {
        if (!employeeCount) employeeCount = text;
      } else if (!industry && text.length > 0 && text.length < 80) {
        industry = text;
      }
    });

    // Website - look in the about section or sidebar
    const websiteElement =
      document.querySelector('a[data-control-name="top_card_link_website"]') ||
      document.querySelector('.link-without-visited-state.org-top-card-primary-actions__action') ||
      document.querySelector('a[href]:not([href*="linkedin.com"]):not([href^="#"])');
    const website = websiteElement?.getAttribute('href') || '';

    // Logo
    const logoElement =
      (document.querySelector('.org-top-card-primary-content__logo img') as HTMLImageElement) ||
      (document.querySelector('img[alt*="logo"]') as HTMLImageElement) ||
      (document.querySelector('.EntityPhoto-square img') as HTMLImageElement);
    const logoUrl = logoElement?.src || '';

    // Description/tagline
    const descElement =
      document.querySelector('.org-top-card-summary__tagline') ||
      document.querySelector('[data-anonymize="tagline"]') ||
      document.querySelector('.org-description-module p');
    const description = descElement?.textContent?.trim() || '';

    return {
      type: 'company',
      linkedinUrl,
      name,
      website: website || undefined,
      industry: industry || undefined,
      employeeCount: employeeCount || undefined,
      logoUrl: logoUrl || undefined,
      description: description || undefined,
    };
  } catch (error) {
    console.error('Error scraping company page:', error);
    return null;
  }
}

// Main scraper function that detects page type and scrapes accordingly
export function scrapeCurrentPage(): LinkedInData | null {
  const pageType = getLinkedInPageType(window.location.href);
  
  if (pageType === 'person') {
    return scrapePersonProfile();
  }
  
  if (pageType === 'company') {
    return scrapeCompanyPage();
  }
  
  return null;
}

// Helper to parse full name into first and last name
function parseFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  
  if (parts.length === 0) {
    return { firstName: '', lastName: '' };
  }
  
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  
  // Handle cases like "John van der Berg" - take first as firstName, rest as lastName
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  
  return { firstName, lastName };
}

// Try to extract company name from headline like "Software Engineer at Google"
function extractCompanyFromHeadline(headline: string): string {
  // Match various patterns: "at Company", "chez Company" (French), "@ Company", "for Company"
  const patterns = [
    /\bat\s+(.+?)(?:\s*\||$)/i,           // English: "at Company"
    /\bchez\s+(.+?)(?:\s*\||$)/i,         // French: "chez Company"
    /\bbei\s+(.+?)(?:\s*\||$)/i,          // German: "bei Company"
    /\b@\s*(.+?)(?:\s*\||$)/i,            // Symbol: "@ Company" or "@Company"
    /\bfor\s+(.+?)(?:\s*\||$)/i,          // English: "for Company"
    /\bà\s+(.+?)(?:\s*\||$)/i,            // French: "à Company"
    /\ben\s+(.+?)(?:\s*\||$)/i,           // Spanish: "en Company"
  ];
  
  for (const pattern of patterns) {
    const match = headline.match(pattern);
    if (match) {
      const company = match[1].trim();
      console.log('Extracted company from headline:', company, 'using pattern:', pattern);
      return company;
    }
  }
  
  return '';
}

