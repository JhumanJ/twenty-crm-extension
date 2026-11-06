import type {
  GraphQLResponse,
  PeopleQueryResult,
  CompaniesQueryResult,
  LinkedInProfileData,
  LinkedInCompanyData,
} from '../types';

// GraphQL Queries - Using correct Links composite field structure
// Links type has: primaryLinkUrl, primaryLinkLabel, secondaryLinks
// Lookups select only what the extension reads, so a workspace that turned off
// an optional standard field (jobTitle, city...) does not break them.
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
    }
  }
`;

const UPDATE_COMPANY = `
  mutation UpdateCompany($id: UUID!, $input: CompanyUpdateInput!) {
    updateCompany(id: $id, data: $input) {
      id
    }
  }
`;

const CREATE_PERSON = `
  mutation CreatePerson($input: PersonCreateInput!) {
    createPerson(data: $input) {
      id
    }
  }
`;

const CREATE_COMPANY = `
  mutation CreateCompany($input: CompanyCreateInput!) {
    createCompany(data: $input) {
      id
    }
  }
`;

const CREATE_NOTE = `
  mutation CreateNote($input: NoteCreateInput!) {
    createNote(data: $input) {
      id
    }
  }
`;

const CREATE_NOTE_TARGET = `
  mutation CreateNoteTarget($input: NoteTargetCreateInput!) {
    createNoteTarget(data: $input) {
      id
    }
  }
`;

// Lists the fields a create or update input accepts in this workspace
const INPUT_FIELDS_QUERY = `
  query InputFields($name: String!) {
    __type(name: $name) {
      inputFields {
        name
      }
    }
  }
`;

// File uploads (served from /metadata)
const CREATE_FILE_UPLOAD = `
  mutation CreateFileUpload(
    $filename: String!
    $size: Float!
    $fieldMetadataUniversalIdentifier: String
  ) {
    createFileUpload(
      filename: $filename
      size: $size
      fileFolder: FilesField
      fieldMetadataUniversalIdentifier: $fieldMetadataUniversalIdentifier
    ) {
      fileId
      uploadUrl
      contentType
    }
  }
`;

const COMPLETE_FILE_UPLOAD = `
  mutation CompleteFileUpload($fileId: String!) {
    completeFileUpload(fileId: $fileId) {
      id
    }
  }
`;

// Standard Person.avatarFile field, the same in every Twenty workspace
const PERSON_AVATAR_FILE_FIELD_UNIVERSAL_IDENTIFIER =
  '20202020-a7c9-4e3d-8f1b-2d5a6b7c8e9f';

// Title of the note that holds values the workspace has no field for
const NOTE_TITLE = 'From LinkedIn';

// Fields a record is still created with when the full input is rejected
const ESSENTIAL_FIELDS = new Set(['name', 'linkedinLink']);

// One scraped value and the standard field it belongs in.
// Values whose field the workspace lacks go to the record's note as
// "label: noteValue" instead; a null noteValue drops them.
type FieldValue = {
  field: string | null; // null: no standard field, always goes to the note
  label: string;
  value: unknown;
  noteValue?: string | null;
};

type RecordKind = 'person' | 'company';

const RECORD_TYPES: Record<RecordKind, {
  createInput: string;
  updateInput: string;
  createMutation: string;
  updateMutation: string;
  createKey: string;
  updateKey: string;
}> = {
  person: {
    createInput: 'PersonCreateInput',
    updateInput: 'PersonUpdateInput',
    createMutation: CREATE_PERSON,
    updateMutation: UPDATE_PERSON,
    createKey: 'createPerson',
    updateKey: 'updatePerson',
  },
  company: {
    createInput: 'CompanyCreateInput',
    updateInput: 'CompanyUpdateInput',
    createMutation: CREATE_COMPANY,
    updateMutation: UPDATE_COMPANY,
    createKey: 'createCompany',
    updateKey: 'updateCompany',
  },
};

export class TwentyApiClient {
  private baseUrl: string;
  private token: string | null = null;
  // Input fields per GraphQL input type, read once per client
  private inputFieldsCache = new Map<string, Promise<Set<string> | null>>();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  setToken(token: string) {
    this.token = token;
  }

  // Upload a profile photo into the person's avatarFile field.
  // Twenty (2.22+) uploads in three steps: createFileUpload returns a one-time
  // upload URL, the bytes are PUT there, then completeFileUpload finalizes it.
  // Returns the value to store in avatarFile, or null if any step fails.
  async uploadProfileImage(
    imageUrl: string,
    filename: string
  ): Promise<Array<{ fileId: string; label: string }> | null> {
    console.log('[Twenty] Starting image upload from:', imageUrl);

    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        console.error('[Twenty] Failed to fetch image:', response.status, response.statusText);
        return null;
      }

      const blob = await response.blob();
      console.log('[Twenty] Image fetched, size:', blob.size, 'type:', blob.type);

      const createResult = await this.graphqlRequest<{
        createFileUpload: { fileId: string; uploadUrl: string; contentType: string };
      }>(
        CREATE_FILE_UPLOAD,
        {
          filename,
          size: blob.size,
          fieldMetadataUniversalIdentifier: PERSON_AVATAR_FILE_FIELD_UNIVERSAL_IDENTIFIER,
        },
        '/metadata'
      );

      const target = createResult.data?.createFileUpload;
      if (createResult.errors?.length || !target) {
        console.error('[Twenty] createFileUpload failed:', createResult.errors);
        return null;
      }

      const putResponse = await fetch(target.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': target.contentType },
        body: blob,
      });

      if (!putResponse.ok) {
        console.error('[Twenty] Failed to upload image:', putResponse.status);
        return null;
      }

      const completeResult = await this.graphqlRequest<{
        completeFileUpload: { id: string };
      }>(COMPLETE_FILE_UPLOAD, { fileId: target.fileId }, '/metadata');

      const file = completeResult.data?.completeFileUpload;
      if (completeResult.errors?.length || !file) {
        console.error('[Twenty] completeFileUpload failed:', completeResult.errors);
        return null;
      }

      console.log('[Twenty] Image uploaded successfully, fileId:', file.id);
      return [{ fileId: file.id, label: filename }];
    } catch (error) {
      console.error('[Twenty] Error uploading image:', error);
      return null;
    }
  }

  // Records live on /graphql; workspace and file operations on /metadata
  private async graphqlRequest<T>(
    query: string,
    variables?: Record<string, unknown>,
    endpoint: '/graphql' | '/metadata' = '/graphql'
  ): Promise<GraphQLResponse<T>> {
    if (!this.token) {
      throw new Error('No authentication token set');
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    return response.json();
  }

  // Fields an input type accepts in this workspace. A workspace can turn off
  // standard fields (e.g. city) or the whole Notes object, so only fields
  // listed here are written. Returns null when the type does not exist, and
  // also when the schema could not be read (then nothing is filtered).
  private getInputFields(typeName: string): Promise<Set<string> | null> {
    let fields = this.inputFieldsCache.get(typeName);
    if (!fields) {
      fields = this.graphqlRequest<{ __type: { inputFields: Array<{ name: string }> } | null }>(
        INPUT_FIELDS_QUERY,
        { name: typeName }
      ).then((result) => {
        if (result.errors?.length) throw new Error(result.errors[0].message);
        const type = result.data?.__type;
        return type ? new Set(type.inputFields.map((field) => field.name)) : null;
      });
      // Read the schema again next time instead of caching a failed request
      fields.catch(() => this.inputFieldsCache.delete(typeName));
      this.inputFieldsCache.set(typeName, fields);
    }
    return fields.catch(() => null);
  }

  private async hasInputField(typeName: string, field: string): Promise<boolean> {
    const fields = await this.getInputFields(typeName);
    return !fields || fields.has(field);
  }

  // Split values into a mutation input (fields this workspace has) and
  // "Key: Value" note lines (everything else)
  private async splitValues(
    typeName: string,
    values: FieldValue[]
  ): Promise<{ input: Record<string, unknown>; noteLines: string[] }> {
    const fields = await this.getInputFields(typeName);
    const input: Record<string, unknown> = {};
    const noteLines: string[] = [];

    for (const item of values) {
      if (item.value === undefined || item.value === null || item.value === '') continue;

      if (item.field && (!fields || fields.has(item.field))) {
        input[item.field] = item.value;
      } else {
        const line = this.toNoteLine(item);
        if (line) noteLines.push(line);
      }
    }

    return { input, noteLines };
  }

  private toNoteLine(item: FieldValue): string | null {
    if (item.noteValue === null) return null;
    const text = item.noteValue ?? String(item.value);
    return text ? `${item.label}: ${text}` : null;
  }

  // Create a record without failing on optional fields: if the full input is
  // rejected, retry with the essentials and move the rest to the note
  private async createRecord(
    kind: RecordKind,
    values: FieldValue[]
  ): Promise<{ id: string; noteLines: string[] }> {
    const type = RECORD_TYPES[kind];
    const { input, noteLines } = await this.splitValues(type.createInput, values);

    const result = await this.graphqlRequest<Record<string, { id: string }>>(
      type.createMutation,
      { input }
    );
    const created = result.data?.[type.createKey];
    if (!result.errors?.length && created) {
      return { id: created.id, noteLines };
    }

    console.warn(`[Twenty] ${type.createKey} rejected, retrying with essential fields:`, result.errors);

    const essentialInput = Object.fromEntries(
      Object.entries(input).filter(([field]) => ESSENTIAL_FIELDS.has(field))
    );
    const movedLines = values
      .filter((item) => item.field && item.field in input && !ESSENTIAL_FIELDS.has(item.field))
      .map((item) => this.toNoteLine(item))
      .filter((line): line is string => !!line);

    const retry = await this.graphqlRequest<Record<string, { id: string }>>(
      type.createMutation,
      { input: essentialInput }
    );
    const retried = retry.data?.[type.createKey];
    if (retry.errors?.length || !retried) {
      throw new Error(retry.errors?.[0]?.message || result.errors?.[0]?.message || `Failed to create ${kind}`);
    }

    return { id: retried.id, noteLines: [...noteLines, ...movedLines] };
  }

  // Attach "Key: Value" lines to a record as a note. Never throws: when the
  // workspace has no Notes object, or anything else fails, the lines are dropped.
  private async addNote(kind: RecordKind, recordId: string, lines: string[]): Promise<void> {
    if (!lines.length) return;

    try {
      const noteFields = await this.getInputFields('NoteCreateInput');
      const targetFields = await this.getInputFields('NoteTargetCreateInput');
      if (!noteFields || !targetFields) {
        console.log('[Twenty] No notes in this workspace, dropping:', lines);
        return;
      }

      // 2.x uses targetPersonId / targetCompanyId; earlier versions personId / companyId
      const capitalized = kind === 'person' ? 'Person' : 'Company';
      const targetField = [`target${capitalized}Id`, `${kind}Id`].find((field) =>
        targetFields.has(field)
      );
      if (!targetField) {
        console.log('[Twenty] Notes cannot be attached to', kind, ', dropping:', lines);
        return;
      }

      const noteInput: Record<string, unknown> = { title: NOTE_TITLE };
      if (noteFields.has('bodyV2')) {
        noteInput.bodyV2 = { markdown: lines.join('\n\n') };
      }

      const note = await this.graphqlRequest<{ createNote: { id: string } }>(CREATE_NOTE, {
        input: noteInput,
      });
      const noteId = note.data?.createNote?.id;
      if (note.errors?.length || !noteId) {
        console.warn('[Twenty] Could not create note:', note.errors);
        return;
      }

      const target = await this.graphqlRequest<{ createNoteTarget: { id: string } }>(
        CREATE_NOTE_TARGET,
        { input: { noteId, [targetField]: recordId } }
      );
      if (target.errors?.length) {
        console.warn('[Twenty] Could not attach note:', target.errors);
      }
    } catch (error) {
      console.warn('[Twenty] Error adding note:', error);
    }
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

  // Exact name match only (case-insensitive), so "Meta" never matches "Metabase"
  async findCompanyByName(
    companyName: string
  ): Promise<CompaniesQueryResult['companies']['edges'][0]['node'] | null> {
    const result = await this.graphqlRequest<CompaniesQueryResult>(
      FIND_COMPANY_BY_NAME,
      {
        filter: {
          name: {
            ilike: this.escapeLike(companyName.trim()),
          },
        },
      }
    );

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    const companies = result.data?.companies.edges || [];
    const exactMatch = companies.find(
      (c) => c.node.name.trim().toLowerCase() === companyName.trim().toLowerCase()
    );

    return exactMatch?.node || null;
  }

  // Exact first and last name match only (case-insensitive)
  async findPersonByName(
    firstName: string,
    lastName: string
  ): Promise<PeopleQueryResult['people']['edges'][0]['node'] | null> {
    const result = await this.graphqlRequest<PeopleQueryResult>(
      FIND_PERSON_BY_NAME,
      {
        filter: {
          and: [
            {
              name: {
                firstName: {
                  ilike: this.escapeLike(firstName.trim()),
                },
              },
            },
            {
              name: {
                lastName: {
                  ilike: this.escapeLike(lastName.trim()),
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

    const people = result.data?.people.edges || [];
    const exactMatch = people.find(
      (p) =>
        p.node.name.firstName.trim().toLowerCase() === firstName.trim().toLowerCase() &&
        p.node.name.lastName.trim().toLowerCase() === lastName.trim().toLowerCase()
    );

    return exactMatch?.node || null;
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
    const { id } = await this.createRecord('company', [
      { field: 'name', label: 'Name', value: companyName },
    ]);
    return { id, name: companyName, created: true };
  }

  // Person values, mapped to the standard fields of a default Twenty workspace
  private async buildPersonValues(
    data: LinkedInProfileData,
    typeName: string
  ): Promise<FieldValue[]> {
    // If finding or creating the company fails, its name goes to the note
    let companyId: string | undefined;
    if (data.currentCompany) {
      try {
        const company = await this.findOrCreateCompany(data.currentCompany);
        companyId = company.id;
        console.log(`[Twenty] Company ${company.created ? 'created' : 'found'}:`, company.name);
      } catch (error) {
        console.error('[Twenty] Error finding/creating company:', error);
      }
    }

    // Only upload the photo when the workspace can store it
    let avatarFile: Array<{ fileId: string; label: string }> | undefined;
    if (data.profileImageUrl && (await this.hasInputField(typeName, 'avatarFile'))) {
      avatarFile =
        (await this.uploadProfileImage(
          data.profileImageUrl,
          `${data.firstName}-${data.lastName}-profile.jpg`
        )) ?? undefined;
    }

    return [
      {
        field: 'name',
        label: 'Name',
        value: { firstName: data.firstName, lastName: data.lastName },
        noteValue: `${data.firstName} ${data.lastName}`.trim(),
      },
      {
        field: 'linkedinLink',
        label: 'LinkedIn',
        value: { primaryLinkUrl: data.linkedinUrl, primaryLinkLabel: 'LinkedIn' },
        noteValue: data.linkedinUrl,
      },
      { field: 'jobTitle', label: 'Job title', value: data.headline },
      { field: 'city', label: 'Location', value: data.location },
      { field: 'avatarFile', label: 'Photo', value: avatarFile, noteValue: null },
      companyId
        ? { field: 'companyId', label: 'Company', value: companyId, noteValue: data.currentCompany }
        : { field: null, label: 'Company', value: data.currentCompany },
    ];
  }

  // Company values, mapped to the standard fields of a default Twenty workspace
  private buildCompanyValues(data: LinkedInCompanyData): FieldValue[] {
    return [
      { field: 'name', label: 'Name', value: data.name },
      {
        field: 'linkedinLink',
        label: 'LinkedIn',
        value: { primaryLinkUrl: data.linkedinUrl, primaryLinkLabel: 'LinkedIn' },
        noteValue: data.linkedinUrl,
      },
      {
        field: 'domainName',
        label: 'Website',
        value: data.website ? { primaryLinkUrl: data.website, primaryLinkLabel: 'Website' } : undefined,
        noteValue: data.website,
      },
      {
        field: 'employees',
        label: 'Employees',
        value: data.employeeCount ? this.parseEmployeeCount(data.employeeCount) : undefined,
        noteValue: data.employeeCount,
      },
      { field: null, label: 'Industry', value: data.industry },
      { field: null, label: 'Description', value: data.description },
    ];
  }

  async createPerson(data: LinkedInProfileData): Promise<{ id: string }> {
    const values = await this.buildPersonValues(data, RECORD_TYPES.person.createInput);
    const { id, noteLines } = await this.createRecord('person', values);
    await this.addNote('person', id, noteLines);
    return { id };
  }

  async createCompany(data: LinkedInCompanyData): Promise<{ id: string }> {
    const { id, noteLines } = await this.createRecord('company', this.buildCompanyValues(data));
    await this.addNote('company', id, noteLines);
    return { id };
  }

  async testConnection(): Promise<boolean> {
    try {
      // Simple query to test if the connection works (only served on /metadata)
      const result = await this.graphqlRequest<{ currentWorkspace: { id: string } }>(
        `query { currentWorkspace { id } }`,
        undefined,
        '/metadata'
      );
      return !result.errors?.length && !!result.data?.currentWorkspace;
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

  // Update existing record with LinkedIn data; values the workspace has no
  // field for go to a note, as on create
  async updateRecordWithLinkedInData(
    id: string,
    type: 'person' | 'company',
    data: LinkedInProfileData | LinkedInCompanyData
  ): Promise<void> {
    if (type !== data.type) return;

    const recordType = RECORD_TYPES[type];
    const values =
      data.type === 'person'
        ? await this.buildPersonValues(data, recordType.updateInput)
        : this.buildCompanyValues(data);
    const { input, noteLines } = await this.splitValues(recordType.updateInput, values);

    const result = await this.graphqlRequest<Record<string, { id: string }>>(
      recordType.updateMutation,
      { id, input }
    );

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    await this.addNote(type, id, noteLines);
  }

  private normalizeLinkedInUrl(url: string): string {
    // Extract the profile/company identifier from various LinkedIn URL formats
    const match = url.match(/linkedin\.com\/(in|company)\/([^/?]+)/);
    return match ? match[2] : url;
  }

  // ilike treats % and _ as wildcards; escape them for an exact match
  private escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, '\\$&');
  }

  private parseEmployeeCount(countStr: string): number | undefined {
    // Parse employee count strings like "1,001-5,000 employees" or "10K+ employees"
    const match = countStr.match(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*([KkMm])?/);
    if (match) {
      const base = parseFloat(match[1].replace(/,/g, ''));
      const multiplier = match[2]?.toLowerCase() === 'm' ? 1_000_000 : match[2] ? 1_000 : 1;
      return Math.round(base * multiplier);
    }
    return undefined;
  }
}
