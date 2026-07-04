import type {
  GraphQLResponse,
  PeopleQueryResult,
  CompaniesQueryResult,
  CreatePersonResult,
  CreateCompanyResult,
  LinkedInProfileData,
  LinkedInCompanyData,
} from '../types';
import { isCountryName, canonicalCountry } from './countries';

// GraphQL Queries - Using correct Links composite field structure
// Links type has: primaryLinkUrl, primaryLinkLabel, secondaryLinks
const FIND_PERSON_BY_LINKEDIN = `
  query FindPersonByLinkedIn($filter: PersonFilterInput) {
    people(filter: $filter, first: 1) {
      edges {
        node {
          id
          name {
            firstName
            lastName
          }
          linkedinLink {
            primaryLinkUrl
            primaryLinkLabel
          }
          jobTitle
          avatarUrl
          city
          company {
            id
            name
          }
        }
      }
    }
  }
`;

const FIND_COMPANY_BY_LINKEDIN = `
  query FindCompanyByLinkedIn($filter: CompanyFilterInput) {
    companies(filter: $filter, first: 1) {
      edges {
        node {
          id
          name
          linkedinLink {
            primaryLinkUrl
            primaryLinkLabel
          }
          domainName {
            primaryLinkUrl
            primaryLinkLabel
          }
          employees
        }
      }
    }
  }
`;

const FIND_COMPANY_BY_NAME = `
  query FindCompanyByName($filter: CompanyFilterInput) {
    companies(filter: $filter, first: 5) {
      edges {
        node {
          id
          name
          linkedinLink {
            primaryLinkUrl
          }
        }
      }
    }
  }
`;

const FIND_PERSON_BY_NAME = `
  query FindPersonByName($filter: PersonFilterInput) {
    people(filter: $filter, first: 5) {
      edges {
        node {
          id
          name {
            firstName
            lastName
          }
          linkedinLink {
            primaryLinkUrl
          }
          jobTitle
          company {
            id
            name
          }
        }
      }
    }
  }
`;

const SEARCH_PEOPLE = `
  query SearchPeople($filter: PersonFilterInput) {
    people(filter: $filter, first: 10) {
      edges {
        node {
          id
          name {
            firstName
            lastName
          }
          jobTitle
          company {
            id
            name
          }
        }
      }
    }
  }
`;

const SEARCH_COMPANIES = `
  query SearchCompanies($filter: CompanyFilterInput) {
    companies(filter: $filter, first: 10) {
      edges {
        node {
          id
          name
          domainName {
            primaryLinkUrl
          }
        }
      }
    }
  }
`;

const UPDATE_PERSON = `
  mutation UpdatePerson($id: UUID!, $input: PersonUpdateInput!) {
    updatePerson(id: $id, data: $input) {
      id
      name {
        firstName
        lastName
      }
    }
  }
`;

const UPDATE_COMPANY = `
  mutation UpdateCompany($id: UUID!, $input: CompanyUpdateInput!) {
    updateCompany(id: $id, data: $input) {
      id
      name
    }
  }
`;

const CREATE_PERSON = `
  mutation CreatePerson($input: PersonCreateInput!) {
    createPerson(data: $input) {
      id
      name {
        firstName
        lastName
      }
      linkedinLink {
        primaryLinkUrl
      }
      company {
        id
        name
      }
    }
  }
`;

const CREATE_COMPANY = `
  mutation CreateCompany($input: CompanyCreateInput!) {
    createCompany(data: $input) {
      id
      name
      linkedinLink {
        primaryLinkUrl
      }
    }
  }
`;

export class TwentyApiClient {
  private baseUrl: string;
  private token: string | null = null;
  // Cache of writable field names per input type (from GraphQL introspection)
  private inputFieldsCache = new Map<string, Set<string>>();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  setToken(token: string) {
    this.token = token;
  }

  private async graphqlRequest<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<GraphQLResponse<T>> {
    if (!this.token) {
      throw new Error('No authentication token set');
    }

    const response = await fetch(`${this.baseUrl}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
        // Some self-hosted Twenty instances are exposed through an ngrok tunnel
        // during development; without this header ngrok's free tier serves an
        // interstitial HTML warning page instead of proxying the request.
        'ngrok-skip-browser-warning': 'true',
      },
      // Send cookies too, so deployments behind an authenticating reverse proxy
      // still pass the gateway. Harmless when no such proxy is present.
      credentials: 'include',
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    return response.json();
  }

  // Run a mutation whose variables contain an input object, and self-heal against
  // schema drift: if Twenty rejects an input field it no longer has (e.g. a
  // renamed/removed standard field), drop that field and retry. This keeps the
  // extension working across Twenty releases without code changes.
  private async graphqlMutate<T>(
    query: string,
    variables: Record<string, unknown>,
    inputKey = 'input'
  ): Promise<GraphQLResponse<T>> {
    // Clone so we can safely prune fields between attempts
    const vars = { ...variables, [inputKey]: { ...(variables[inputKey] as Record<string, unknown>) } };
    const input = vars[inputKey] as Record<string, unknown>;

    let result = await this.graphqlRequest<T>(query, vars);
    let guard = 0;
    while (guard++ < 8) {
      const message = result.errors?.[0]?.message || '';
      const match = message.match(/doesn'?t have any ["“]([^"”]+)["”] field/i);
      if (!match || !(match[1] in input)) break;
      console.warn(`[Twenty] Schema has no "${match[1]}" field — dropping it and retrying`);
      delete input[match[1]];
      result = await this.graphqlRequest<T>(query, vars);
    }
    return result;
  }

  // Introspect the writable field names of a GraphQL input type (cached).
  private async getInputFields(typeName: string): Promise<Set<string>> {
    const cached = this.inputFieldsCache.get(typeName);
    if (cached) return cached;
    let names = new Set<string>();
    try {
      const result = await this.graphqlRequest<{ __type: { inputFields: { name: string }[] | null } | null }>(
        `query InputFields($n: String!) { __type(name: $n) { inputFields { name } } }`,
        { n: typeName }
      );
      names = new Set((result.data?.__type?.inputFields || []).map((f) => f.name));
    } catch (error) {
      console.warn(`[Twenty] Could not introspect ${typeName}:`, error);
    }
    this.inputFieldsCache.set(typeName, names);
    return names;
  }

  // Resolve where a location string should go on the given input type, and shape
  // the value accordingly. Twenty has changed this over time, so we discover it:
  // a scalar field (city/location/town) takes the raw string; an ADDRESS composite
  // (e.g. a custom "address" field) takes parsed city/country subfields.
  private async buildLocationInput(
    typeName: string,
    location: string
  ): Promise<{ field: string; value: unknown } | null> {
    const fields = await this.getInputFields(typeName);

    const scalar = ['city', 'location', 'town'].find((f) => fields.has(f));
    if (scalar) return { field: scalar, value: location };

    // Otherwise look for an ADDRESS composite field (standard or custom),
    // matching any field whose name looks address-like.
    const addressField =
      (fields.has('address') ? 'address' : null) ||
      Array.from(fields).find((f) => /address/i.test(f));
    if (addressField) return { field: addressField, value: parseLocationToAddress(location) };

    if (fields.size === 0) return { field: 'city', value: location }; // introspection off; optimistic
    console.warn(`[Twenty] No location/address field on ${typeName}. Available:`, Array.from(fields));
    return null;
  }

  async findPersonByLinkedInUrl(
    linkedinUrl: string
  ): Promise<PeopleQueryResult['people']['edges'][0]['node'] | null> {
    const normalizedUrl = this.normalizeLinkedInUrl(linkedinUrl);
    
    const result = await this.graphqlRequest<PeopleQueryResult>(
      FIND_PERSON_BY_LINKEDIN,
      {
        filter: {
          linkedinLink: {
            primaryLinkUrl: {
              ilike: `%${normalizedUrl}%`,
            },
          },
        },
      }
    );

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    return result.data?.people.edges[0]?.node || null;
  }

  async findCompanyByLinkedInUrl(
    linkedinUrl: string
  ): Promise<CompaniesQueryResult['companies']['edges'][0]['node'] | null> {
    const normalizedUrl = this.normalizeLinkedInUrl(linkedinUrl);
    
    const result = await this.graphqlRequest<CompaniesQueryResult>(
      FIND_COMPANY_BY_LINKEDIN,
      {
        filter: {
          linkedinLink: {
            primaryLinkUrl: {
              ilike: `%${normalizedUrl}%`,
            },
          },
        },
      }
    );

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    return result.data?.companies.edges[0]?.node || null;
  }

  async findCompanyByName(
    companyName: string
  ): Promise<CompaniesQueryResult['companies']['edges'][0]['node'] | null> {
    // Search for company by name (case-insensitive)
    const result = await this.graphqlRequest<CompaniesQueryResult>(
      FIND_COMPANY_BY_NAME,
      {
        filter: {
          name: {
            ilike: `%${companyName}%`,
          },
        },
      }
    );

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    // Try to find exact match first (case-insensitive)
    const companies = result.data?.companies.edges || [];
    const exactMatch = companies.find(
      (c) => c.node.name.toLowerCase() === companyName.toLowerCase()
    );
    
    if (exactMatch) {
      return exactMatch.node;
    }

    // Return first partial match if no exact match
    return companies[0]?.node || null;
  }

  async findPersonByName(
    firstName: string,
    lastName: string
  ): Promise<PeopleQueryResult['people']['edges'][0]['node'] | null> {
    // Search for person by first and last name
    const result = await this.graphqlRequest<PeopleQueryResult>(
      FIND_PERSON_BY_NAME,
      {
        filter: {
          and: [
            {
              name: {
                firstName: {
                  ilike: `%${firstName}%`,
                },
              },
            },
            {
              name: {
                lastName: {
                  ilike: `%${lastName}%`,
                },
              },
            },
          ],
        },
      }
    );

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    // Try to find exact match first (case-insensitive)
    const people = result.data?.people.edges || [];
    const exactMatch = people.find(
      (p) =>
        p.node.name.firstName.toLowerCase() === firstName.toLowerCase() &&
        p.node.name.lastName.toLowerCase() === lastName.toLowerCase()
    );

    if (exactMatch) {
      return exactMatch.node;
    }

    // Return first partial match if no exact match
    return people[0]?.node || null;
  }

  async findOrCreateCompany(
    companyName: string
  ): Promise<{ id: string; name: string; created: boolean }> {
    // First, try to find existing company by name
    const existingCompany = await this.findCompanyByName(companyName);
    
    if (existingCompany) {
      console.log('Found existing company:', existingCompany.name);
      return { id: existingCompany.id, name: existingCompany.name, created: false };
    }

    // Create new company if not found
    console.log('Creating new company:', companyName);
    const newCompany = await this.createCompanySimple(companyName);
    return { id: newCompany.id, name: newCompany.name, created: true };
  }

  // Simple company creation (just name, no LinkedIn URL)
  private async createCompanySimple(
    name: string
  ): Promise<CreateCompanyResult['createCompany']> {
    const result = await this.graphqlMutate<CreateCompanyResult>(
      CREATE_COMPANY,
      { input: { name } }
    );

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    if (!result.data?.createCompany) {
      throw new Error('Failed to create company');
    }

    return result.data.createCompany;
  }

  async createPerson(
    data: LinkedInProfileData
  ): Promise<CreatePersonResult['createPerson'] & { companyCreated?: boolean }> {
    let companyId: string | undefined;
    let companyCreated = false;

    // If person has a company, find or create it first
    console.log('[Twenty] createPerson - currentCompany:', data.currentCompany);
    if (data.currentCompany) {
      console.log('[Twenty] Attempting to find or create company:', data.currentCompany);
      try {
        const companyResult = await this.findOrCreateCompany(data.currentCompany);
        companyId = companyResult.id;
        companyCreated = companyResult.created;
        console.log(`[Twenty] Company ${companyResult.created ? 'created' : 'found'}:`, companyResult.name, 'id:', companyId);
      } catch (error) {
        console.error('[Twenty] Error finding/creating company:', error);
        // Continue without company link if this fails
      }
    } else {
      console.log('[Twenty] No currentCompany in data, skipping company creation');
    }

    // Link the LinkedIn photo URL directly. Twenty's old multipart uploadImage
    // mutation no longer exists, and Person exposes an avatarUrl field.
    const avatarUrl = data.profileImageUrl || '';

    // Only include optional fields that actually have a value — sending empty
    // strings makes Twenty validate fields the page never filled in.
    const input: Record<string, unknown> = {
      name: {
        firstName: data.firstName,
        lastName: data.lastName,
      },
      linkedinLink: {
        primaryLinkUrl: data.linkedinUrl,
        primaryLinkLabel: 'LinkedIn',
      },
    };
    if (data.headline) input.jobTitle = data.headline;
    if (avatarUrl) input.avatarUrl = avatarUrl;
    if (data.location) {
      const loc = await this.buildLocationInput('PersonCreateInput', data.location);
      if (loc) input[loc.field] = loc.value;
    }
    if (companyId) input.companyId = companyId;

    const result = await this.graphqlMutate<CreatePersonResult>(CREATE_PERSON, { input });

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    if (!result.data?.createPerson) {
      throw new Error('Failed to create person');
    }

    return { ...result.data.createPerson, companyCreated };
  }

  async createCompany(
    data: LinkedInCompanyData
  ): Promise<CreateCompanyResult['createCompany']> {
    const input: Record<string, unknown> = {
      name: data.name,
      linkedinLink: {
        primaryLinkUrl: data.linkedinUrl,
        primaryLinkLabel: 'LinkedIn',
      },
    };
    if (data.website) {
      input.domainName = { primaryLinkUrl: data.website, primaryLinkLabel: 'Website' };
    }
    if (data.employeeCount) {
      const employees = this.parseEmployeeCount(data.employeeCount);
      if (employees !== undefined) input.employees = employees;
    }

    const result = await this.graphqlMutate<CreateCompanyResult>(CREATE_COMPANY, { input });

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    if (!result.data?.createCompany) {
      throw new Error('Failed to create company');
    }

    return result.data.createCompany;
  }

  async testConnection(): Promise<boolean> {
    try {
      // Probe a field the API-key (Core API) schema actually exposes. The
      // frontend-only `currentWorkspace`/`currentUser` roots are not available
      // here, but `people` is — and it's what the rest of the extension uses.
      const result = await this.graphqlRequest<PeopleQueryResult>(
        `query TestConnection { people(first: 1) { edges { node { id } } } }`
      );
      return !result.errors?.length && Array.isArray(result.data?.people?.edges);
    } catch {
      return false;
    }
  }

  // Search for records by name
  async searchRecords(
    query: string,
    type: 'person' | 'company'
  ): Promise<Array<{ id: string; name: string; subtitle?: string; type: 'person' | 'company' }>> {
    if (type === 'person') {
      const result = await this.graphqlRequest<PeopleQueryResult>(SEARCH_PEOPLE, {
        filter: {
          or: [
            { name: { firstName: { ilike: `%${query}%` } } },
            { name: { lastName: { ilike: `%${query}%` } } },
          ],
        },
      });

      if (result.errors?.length) {
        throw new Error(result.errors[0].message);
      }

      return (result.data?.people.edges || []).map((edge) => ({
        id: edge.node.id,
        name: `${edge.node.name.firstName} ${edge.node.name.lastName}`,
        subtitle: edge.node.jobTitle || edge.node.company?.name || undefined,
        type: 'person' as const,
      }));
    } else {
      const result = await this.graphqlRequest<CompaniesQueryResult>(SEARCH_COMPANIES, {
        filter: {
          name: { ilike: `%${query}%` },
        },
      });

      if (result.errors?.length) {
        throw new Error(result.errors[0].message);
      }

      return (result.data?.companies.edges || []).map((edge) => ({
        id: edge.node.id,
        name: edge.node.name,
        subtitle: edge.node.domainName?.primaryLinkUrl || undefined,
        type: 'company' as const,
      }));
    }
  }

  // Update existing record with LinkedIn data
  async updateRecordWithLinkedInData(
    id: string,
    type: 'person' | 'company',
    data: LinkedInProfileData | LinkedInCompanyData
  ): Promise<void> {
    if (type === 'person' && data.type === 'person') {
      const personData = data as LinkedInProfileData;
      
      // Find or create company if present
      let companyId: string | undefined;
      if (personData.currentCompany) {
        try {
          const companyResult = await this.findOrCreateCompany(personData.currentCompany);
          companyId = companyResult.id;
        } catch (error) {
          console.error('Error finding/creating company:', error);
        }
      }

      // Link the LinkedIn photo URL directly (see createPerson).
      const avatarUrl = personData.profileImageUrl || undefined;

      const input: Record<string, unknown> = {
        name: {
          firstName: personData.firstName,
          lastName: personData.lastName,
        },
        linkedinLink: {
          primaryLinkUrl: personData.linkedinUrl,
          primaryLinkLabel: 'LinkedIn',
        },
      };
      if (personData.headline) input.jobTitle = personData.headline;
      if (avatarUrl) input.avatarUrl = avatarUrl;
      if (personData.location) {
        const loc = await this.buildLocationInput('PersonUpdateInput', personData.location);
        if (loc) input[loc.field] = loc.value;
      }
      if (companyId) input.companyId = companyId;

      const result = await this.graphqlMutate<{ updatePerson: { id: string } }>(
        UPDATE_PERSON,
        { id, input }
      );

      if (result.errors?.length) {
        throw new Error(result.errors[0].message);
      }
    } else if (type === 'company' && data.type === 'company') {
      const companyData = data as LinkedInCompanyData;

      const input: Record<string, unknown> = {
        name: companyData.name,
        linkedinLink: {
          primaryLinkUrl: companyData.linkedinUrl,
          primaryLinkLabel: 'LinkedIn',
        },
      };
      if (companyData.website) {
        input.domainName = { primaryLinkUrl: companyData.website, primaryLinkLabel: 'Website' };
      }
      if (companyData.employeeCount) {
        const employees = this.parseEmployeeCount(companyData.employeeCount);
        if (employees !== undefined) input.employees = employees;
      }

      const result = await this.graphqlMutate<{ updateCompany: { id: string } }>(
        UPDATE_COMPANY,
        { id, input }
      );

      if (result.errors?.length) {
        throw new Error(result.errors[0].message);
      }
    }
  }

  private normalizeLinkedInUrl(url: string): string {
    // Extract the profile/company identifier from various LinkedIn URL formats
    const match = url.match(/linkedin\.com\/(in|company)\/([^/?]+)/);
    return match ? match[2] : url;
  }

  private parseEmployeeCount(countStr: string): number | undefined {
    // Parse employee count strings like "1,001-5,000 employees"
    const match = countStr.match(/(\d+(?:,\d+)?)/);
    if (match) {
      return parseInt(match[1].replace(/,/g, ''), 10);
    }
    return undefined;
  }
}

// Split a LinkedIn location string ("City, Region, Country") into Twenty ADDRESS
// composite subfields. LinkedIn always puts the city first, so we take that
// directly (no city list needed); the last segment is set as country only when
// it matches a known country name. A lone token is classified as country if it's
// a known country, otherwise treated as the city.
function parseLocationToAddress(location: string): Record<string, string> {
  const parts = location.split(',').map((s) => s.trim()).filter(Boolean);
  const out: Record<string, string> = {};
  if (parts.length === 0) return out;

  if (parts.length === 1) {
    if (isCountryName(parts[0])) out.addressCountry = canonicalCountry(parts[0]);
    else out.addressCity = parts[0];
    return out;
  }

  out.addressCity = parts[0];
  const last = parts[parts.length - 1];
  if (isCountryName(last)) out.addressCountry = canonicalCountry(last);
  return out;
}
