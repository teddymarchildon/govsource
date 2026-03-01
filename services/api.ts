import { supabase } from '../utils/supabase/client';
import { Agency, AgencyDocument, Bill, Congressman, Judge, BillText, CongressmanTerm, SavedCongressman, SavedBill, BillSummary } from '../types/types';

// Storage API
export const getStoragePublicUrl = (bucket: string, path: string): string | null => {
  if (!path) return null;
  try {
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);
    return publicUrl;
  } catch (error) {
    throw error;
  }
};

// Bills API
export const getBills = async (params: any = {}) => {
  // Enhanced query to include sponsor information and most recent action
  let query = supabase.from('bill').select(`
    *,
    sponsor:sponsored_bills!bill_id(
      congressman:congressman(*)
    ),
    actions:bill_action!bill_id(
      id,
      date,
      text,
      type
    )
  `).order("introduced_date", { ascending: false });

  if (params.limit) {
    query = query.limit(params.limit);
  }

  if (params.policy_area) {
    query = query.eq('policy_area', params.policy_area);
  }

  // If sponsor_id is provided, filter bills by sponsor
  if (params.sponsor_id) {
    // We need to get the bill IDs sponsored by this congressman first
    const { data: sponsoredBills, error: sponsorError } = await supabase
      .from('sponsored_bills')
      .select('bill_id')
      .eq('congressman_id', params.sponsor_id);

    if (sponsorError) throw sponsorError;

    // If there are sponsored bills, filter the query
    if (sponsoredBills && sponsoredBills.length > 0) {
      const billIds = sponsoredBills.map(item => item.bill_id);
      query = query.in('id', billIds);
    } else {
      // If no bills are sponsored by this congressman, return empty array
      return [];
    }
  }

  const { data, error } = await query;

  if (error) throw error;

  // Process the data to include the most recent action and format sponsor
  return data.map(bill => {
    // Sort actions by date (descending) and get the most recent one
    const sortedActions = bill.actions ?
      [...bill.actions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) :
      [];

    return {
      ...bill,
      // Format sponsor to match the expected structure in BillCard
      sponsor: bill.sponsor && bill.sponsor.length > 0 ?
        { congressman: bill.sponsor[0].congressman } :
        undefined,
      // Add most recent action
      most_recent_action: sortedActions.length > 0 ? sortedActions[0] : null,
      // Remove the actions array to keep the response clean
      actions: undefined
    };
  });
};

export const getBillById = async (billId: string): Promise<Bill> => {
  const { data, error } = await supabase
    .from('bill')
    .select(`
      *,
      sponsor:sponsored_bills!bill_id(
        congressman:congressman(*)
      ),
      cosponsors:cosponsored_bills!bill_id(
        congressman:congressman(*)
      ),
      actions:bill_action!bill_id(
        id,
        date,
        text,
        type
      )
    `)
    .eq('id', billId)
    .single();

  if (error) throw error;

  // Sort actions by date (descending) and get the most recent one
  const sortedActions = data.actions ?
    [...data.actions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) :
    [];

  // Transform data to match the Bill interface
  return {
    ...data,
    sponsor: data.sponsor && data.sponsor.length > 0 ? data.sponsor[0] : undefined,
    cosponsors: data.cosponsors || [],
    most_recent_action: sortedActions.length > 0 ? sortedActions[0] : null,
    actions: undefined
  } as Bill;
};

export const getBillTexts = async (billId: string): Promise<BillText[]> => {
  const { data, error } = await supabase
    .from('bill_text')
    .select('*')
    .eq('bill_id', billId);

  if (error) throw error;
  return data as BillText[];
};

export const getBillSponsors = async (billId: string): Promise<Congressman[]> => {
  const { data, error } = await supabase
    .from('sponsored_bills')
    .select('congressman_id, congressman:congressman(*)')
    .eq('bill_id', billId);

  if (error) throw error;
  return data.map(item => item.congressman) as unknown as Congressman[];
};

export const getBillCosponsors = async (billId: string): Promise<Congressman[]> => {
  const { data, error } = await supabase
    .from('cosponsored_bills')
    .select('congressman_id, congressman:congressman(*)')
    .eq('bill_id', billId);

  if (error) throw error;
  return data.map(item => item.congressman) as unknown as Congressman[];
};

// Congressmen API
export const getCongressmen = async (params: any = {}) => {
  let query = supabase.from('congressman').select('*');

  if (params.limit) {
    query = query.limit(params.limit);
  }

  if (params.party) {
    query = query.eq('party', params.party);
  }

  if (params.state) {
    query = query.eq('state', params.state);
  }

  if (params.chamber) {
    query = query.eq('chamber', params.chamber);
  }

  // Search by name if provided
  if (params.search) {
    query = query.ilike('full_name', `%${params.search}%`);
  }

  // Filter for current congressmen if requested
  if (params.current === true) {
    // Get the IDs of current congressmen (those with null end_year in their most recent term)
    const { data: currentCongressmenIds, error: currentError } = await supabase
      .from('congressman_term')
      .select('congressman_id')
      .is('end_year', null);

    if (currentError) throw currentError;

    // If we have current congressmen IDs, filter the main query
    if (currentCongressmenIds && currentCongressmenIds.length > 0) {
      const ids = currentCongressmenIds.map(item => item.congressman_id);
      query = query.in('id', ids);
    }
  }

  const { data, error } = await query;

  if (error) throw error;
  return data as unknown as Congressman[];
};

export const getCongressmanById = async (congressmanId: string) => {
  
  const { data, error } = await supabase
    .from('congressman')
    .select('*')
    .eq('id', congressmanId)
    .single();

  if (error) throw error;
  return data;
};

export const getCongressmanSponsoredBills = async (congressmanId: string): Promise<Bill[]> => {
  
  const { data, error } = await supabase
    .from('sponsored_bills')
    .select(`
      bill_id,
      bill:bill(
        *,
        sponsor:sponsored_bills!bill_id(
          congressman:congressman(*)
        ),
        cosponsors:cosponsored_bills!bill_id(
          congressman:congressman(*)
        )
      )
    `)
    .eq('congressman_id', congressmanId);

  if (error) throw error;
  // @ts-expect-error - Ignoring type checking for the entire return block due to complex nested structure
  return data.map(item => ({
    ...item.bill,
    // @ts-expect-error - Ignoring type checking for sponsor property due to potential undefined or array structure
    sponsor: item.bill.sponsor && item.bill.sponsor.length > 0 ?
    // @ts-expect-error - Ignoring type checking for cosponsors mapping due to unknown structure
      { congressman: item.bill.sponsor[0].congressman } : undefined,
    // @ts-expect-error - Ignoring type checking for cosponsors mapping due to unknown structure
    cosponsors: item.bill.cosponsors ?
    // @ts-expect-error - Ignoring type checking for cosponsors mapping due to unknown structure
      item.bill.cosponsors.map((c: unknown) => ({ congressman: c.congressman })) : []
  })) as Bill[];
};

export const getCongressmanCosponsoredBills = async (congressmanId: string): Promise<Bill[]> => {
  const { data, error } = await supabase
    .from('cosponsored_bills')
    .select(`
      bill_id,
      bill:bill(
        *,
        sponsor:sponsored_bills!bill_id(
          congressman:congressman(*)
        ),
        cosponsors:cosponsored_bills!bill_id(
          congressman:congressman(*)
        )
      )
    `)
    .eq('congressman_id', congressmanId);

  if (error) throw error;
  // @ts-expect-error - Ignoring type checking for the entire return block due to complex nested structure
  return data.map(item => ({
    ...item.bill,
    // @ts-expect-error - Ignoring type checking for sponsor property due to potential undefined or array structure
    sponsor: item.bill.sponsor && item.bill.sponsor.length > 0 ?
    // @ts-expect-error - Ignoring type checking for cosponsors mapping due to unknown structure
      { congressman: item.bill.sponsor[0].congressman } : undefined,
    // @ts-expect-error - Ignoring type checking for cosponsors mapping due to unknown structure
    cosponsors: item.bill.cosponsors ?
    // @ts-expect-error - Ignoring type checking for cosponsors mapping due to unknown structure
      item.bill.cosponsors.map((c: unknown) => ({ congressman: c.congressman })) : []
  })) as Bill[];
};

export const getCongressmanTerms = async (congressmanId: string): Promise<CongressmanTerm[]> => {
  
  const { data, error } = await supabase
    .from('congressman_term')
    .select('*')
    .eq('congressman_id', congressmanId)
    .order('start_year', { ascending: false });

  if (error) throw error;
  return data as CongressmanTerm[];
};

// Save/Unsave Congressmen
export const saveCongressman = async (userId: string, congressmanId: string) => {
  try {
    
    const { data, error } = await supabase
      .from('saved_congressman')
      .insert([
        { user_id: userId, congressman_id: congressmanId }
      ])
      .select();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    throw error;
  }
};

export const unsaveCongressman = async (userId: string, congressmanId: string) => {
  try {
    
    const { data, error } = await supabase
      .from('saved_congressman')
      .delete()
      .match({ user_id: userId, congressman_id: congressmanId })
      .select();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    throw error;
  }
};

export const isCongressmanSaved = async (userId: string, congressmanId: string) => {
  try {
    
    const { error, count } = await supabase
      .from('saved_congressman')
      .select('*', { count: 'exact' })
      .match({ user_id: userId, congressman_id: congressmanId });

    if (error) {
      throw error;
    }

    const isSaved = (count || 0) > 0;
    return isSaved;
  } catch (_error) {
    return false;
  }
};

// Save/Unsave Bills
export const saveBill = async (userId: string, billId: string) => {
  try {
    
    const { data, error } = await supabase
      .from('saved_bill')
      .insert([
        { user_id: userId, bill_id: billId }
      ])
      .select();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    throw error;
  }
};

export const unsaveBill = async (userId: string, billId: string) => {
  try {
    
    const { data, error } = await supabase
      .from('saved_bill')
      .delete()
      .match({ user_id: userId, bill_id: billId })
      .select();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    throw error;
  }
};

export const isBillSaved = async (userId: string, billId: string) => {
  try {
    
    const { error, count } = await supabase
      .from('saved_bill')
      .select('*', { count: 'exact' })
      .match({ user_id: userId, bill_id: billId });

    if (error) {
      throw error;
    }

    const isSaved = (count || 0) > 0;
    return isSaved;
  } catch (_error) {
    return false;
  }
};

// Get Saved Items
export const getSavedCongressmen = async (userId: string): Promise<SavedCongressman[]> => {
  
  const { data, error } = await supabase
    .from('saved_congressman')
    .select('*, congressman:congressman_id(*)')
    .eq('user_id', userId);

  if (error) throw error;
  return data as SavedCongressman[];
};

export const getSavedBills = async (userId: string): Promise<SavedBill[]> => {
  
  const { data, error } = await supabase
    .from('saved_bill')
    .select('*, bill:bill_id(*)')
    .eq('user_id', userId);

  if (error) throw error;
  return data as SavedBill[];
};

export async function getBillActions(billId: string) {
  
  const { data, error } = await supabase
    .from('bill_action')
    .select('*')
    .eq('bill_id', billId)
    .order('date', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

// Agencies API
export const getAgencies = async (params: any = {}) => {
  
  let query = supabase.from('agency').select('*, parent:parent_id(id, name, short_name)');

  if (params.limit) {
    query = query.limit(params.limit);
  }

  // Search by name if provided
  if (params.search) {
    query = query.ilike('name', `%${params.search}%`);
  }

  // Filter by parent agency
  if (params.parent_id) {
    query = query.eq('parent_id', params.parent_id);
  }

  // Sort results
  const orderBy = params.order_by || 'name';
  const order = params.order || 'asc';
  query = query.order(orderBy, { ascending: order === 'asc' });

  const { data, error } = await query;

  if (error) throw error;
  return data;
};

export const getAgencyById = async (agencyId: string) => {
  
  const { data, error } = await supabase
    .from('agency')
    .select('*, parent:parent_id(id, name, short_name)')
    .eq('id', agencyId)
    .single();

  if (error) throw error;
  return data;
};

export const getChildAgencies = async (parentId: string) => {
  
  const { data, error } = await supabase
    .from('agency')
    .select('*')
    .eq('parent_id', parentId);

  if (error) throw error;
  return data;
};

// Save/Unsave Agency
export const saveAgency = async (userId: string, agencyId: string) => {
  try {
    
    const { data, error } = await supabase
      .from('saved_agency')
      .insert([
        { user_id: userId, agency_id: agencyId }
      ])
      .select();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    throw error;
  }
};

export const unsaveAgency = async (userId: string, agencyId: string) => {
  try {
    
    const { data, error } = await supabase
      .from('saved_agency')
      .delete()
      .match({ user_id: userId, agency_id: agencyId })
      .select();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    throw error;
  }
};

export const isAgencySaved = async (userId: string, agencyId: string) => {
  
  try {
    const { error, count } = await supabase
      .from('saved_agency')
      .select('*', { count: 'exact' })
      .match({ user_id: userId, agency_id: agencyId });

    if (error) {
      throw error;
    }

    const isSaved = (count || 0) > 0;
    return isSaved;
  } catch (_error) {
    return false;
  }
};

export const getSavedAgencies = async (userId: string) => {
  
  const { data, error } = await supabase
    .from('saved_agency')
    .select('*, agency:agency_id(*)')
    .eq('user_id', userId);

  if (error) throw error;
  return data;
};

export const getAgencyDocuments = async (agencyId: string): Promise<AgencyDocument[]> => {
  try {
    // First, get all document IDs for this agency
    
    const { data: agencyDocuments, error: agencyError } = await supabase
      .from('agency_agencydocument')
      .select('agency_document_id')
      .eq('agency_id', agencyId);

    if (agencyError) {
      throw agencyError;
    }

    if (!agencyDocuments || agencyDocuments.length === 0) {
      return [];
    }

    // Extract document IDs
    const documentIds = agencyDocuments.map(doc => doc.agency_document_id);

    // Then, fetch all documents with those IDs
    const { data: documents, error: documentsError } = await supabase
      .from('agency_document')
      .select('*')
      .in('id', documentIds)
      .order('publication_date', { ascending: false });

    if (documentsError) {
      throw documentsError;
    }

    return documents || [];
  } catch (error) {
    throw error;
  }
};

export const getTopLevelAgencies = async (): Promise<Agency[]> => {
  try {
    
    const { data, error } = await supabase
      .from('agency')
      .select('*')
      .is('parent_id', null)
      .order('name');

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    throw error;
  }
};

export const getAgencyRules = async (params: {
  agencyId?: string;
  limit?: number;
  type?: string;
  subtype?: string;
  search?: string;
  start_date?: string;
  end_date?: string;
  sort_order?: 'asc' | 'desc';
  excludeExecutiveOrders?: boolean;
} = {}): Promise<AgencyDocument[]> => {
  try {
    // First, get all agency documents that are of type 'Rule'
    
    let query = supabase
      .from('agency_document')
      .select(`
        *,
        agencies:agency_agencydocument!agency_document_id(
          agency:agency(*)
        )
      `)
      .order('publication_date', { ascending: params.sort_order === 'asc' });

    // Apply limit if provided
    if (params.limit) {
      query = query.limit(params.limit);
    }

    // Filter by type if provided
    if (params.type) {
      query = query.eq('type', params.type);
    }

    // Filter by subtype if provided
    if (params.subtype) {
      query = query.eq('subtype', params.subtype);
    }

    // Search by title if provided
    if (params.search) {
      query = query.ilike('title', `%${params.search}%`);
    }

    // Apply date range filter if provided
    if (params.start_date) {
      query = query.gte('publication_date', params.start_date);
    }

    if (params.end_date) {
      query = query.lte('publication_date', params.end_date);
    }

    // Filter by agency if provided
    if (params.agencyId) {
      // Get documents linked to this agency
      
      const { data: agencyDocuments, error: agencyError } = await supabase
        .from('agency_agencydocument')
        .select('agency_document_id')
        .eq('agency_id', params.agencyId);

      if (agencyError) {
        throw agencyError;
      }

      if (!agencyDocuments || agencyDocuments.length === 0) {
        return [];
      }

      // Extract document IDs
      const documentIds = agencyDocuments.map(doc => doc.agency_document_id);
      query = query.in('id', documentIds);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data?.map(doc => ({
      ...doc,
      agency: doc.agencies?.[0]?.agency
    })) || [];
  } catch (error) {
    throw error;
  }
};

export const getClusterJoinedJudges = async (clusterId: string): Promise<Judge[]> => {
  // Get all unique judges who have joined any opinion in this cluster
  
  const { data: opinions, error: opinionsError } = await supabase
    .from('court_opinion')
    .select(`
      joined_by:judge(*)
    `)
    .eq('cluster_id', clusterId);

  if (opinionsError) {
    throw opinionsError;
  }

  // Extract unique judges from the joined_by arrays
  const uniqueJudges = new Map<string, Judge>();
  opinions?.forEach(opinion => {
    opinion.joined_by?.forEach((judge: Judge) => {
      if (judge && judge.id) {
        uniqueJudges.set(judge.id, judge);
      }
    });
  });

  return Array.from(uniqueJudges.values());
};

export const getCourtOpinions = async (params: {
  limit?: number;
  court_id?: number;
  author_id?: string;
  cluster_id?: string;
  search?: string;
  oldest_first?: boolean;
  start_date?: string;
  end_date?: string;
} = {}) => {
  
  let query = supabase
    .from('court_opinion')
    .select(`
      *,
      author:judge(*),
      cluster:cluster(*),
      joined_by:judge(*)
    `);

  if (params.limit) {
    query = query.limit(params.limit);
  }

  if (params.court_id) {
    query = query.eq('court_id', params.court_id);
  }

  if (params.author_id) {
    query = query.eq('author_id', params.author_id);
  }

  if (params.cluster_id) {
    query = query.eq('cluster_id', params.cluster_id);
  }

  // Search by case name if provided
  if (params.search) {
    // Search in cluster case_name and case_name_short
    query = query.or(`cluster.case_name.ilike.%${params.search}%,cluster.case_name_short.ilike.%${params.search}%`);
  }

  // Filter by date range if provided
  if (params.start_date) {
    query = query.gte('date', params.start_date);
  }

  if (params.end_date) {
    query = query.lte('date', params.end_date);
  }

  // Sort by date (newest first by default)
  query = query.order('date', { ascending: params.oldest_first ? true : false });

  const { data, error } = await query;

  if (error) throw error;
  return data;
};

export async function getCourtOpinionById(id: string) {
  
  const { data, error } = await supabase
    .from('court_opinion')
    .select(`
      *,
      court:court(*),
      author:judge(*),
      cluster:cluster(*),
      joined_by:judge(*)
    `)
    .eq('id', id)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export const getClusters = async (params: string | { court_id?: number; search?: string; limit?: number; oldest_first?: boolean } = {}) => {
  try {
    
    let query = supabase
      .from('cluster')
      .select(`
        id,
        remote_id,
        court_id,
        court:court(*),
        slug,
        case_name,
        case_name_short,
        opinions:court_opinion!cluster_id(
          id,
          type,
          date,
          pdf_file_path,
          html_file_path,
          text_file_path
        )
      `);

    // If params is a string, treat it as a search query
    if (typeof params === 'string') {
      if (params) {
        query = query.ilike('case_name', `%${params}%`);
      }
      query = query.eq('court_id', 1); // SCOTUS ID
      query = query.limit(50);
    } else {
      // Handle object params
      if (params.court_id) {
        query = query.eq('court_id', params.court_id);
      }
      if (params.search) {
        query = query.or(`case_name.ilike.%${params.search}%,case_name_short.ilike.%${params.search}%`);
      }
      if (params.limit) {
        query = query.limit(params.limit);
      }
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }
    return data;
  } catch (error) {
    throw error;
  }
};

// User Preferences API
export const getUserPreferences = async (userId: string) => {
  try {
    
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    // Return the first preference found, or null if none exist
    return data && data.length > 0 ? data[0] : null;
  } catch (_error) {
    return null;
  }
};

export const createUserPreferences = async (userId: string, preferences: { states?: string[], policy_areas?: string[] }) => {
  try {
    
    const { data, error } = await supabase
      .from('user_preferences')
      .insert({
        user_id: userId,
        states: preferences.states || [],
        policy_areas: preferences.policy_areas || []
      })
      .select();

    if (error) {
      throw error;
    }

    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    throw error;
  }
};

export const updateUserPreferences = async (userId: string, preferences: { states?: string[], policy_areas?: string[] }) => {
  try {
    // First check if preferences exist
    const existing = await getUserPreferences(userId);

    if (existing) {
      // If preferences exist, update them
      
      const { error: updateError } = await supabase
        .from('user_preferences')
        .update({
          states: preferences.states || [],
          policy_areas: preferences.policy_areas || []
        })
        .eq('id', existing.id);

      if (updateError) {
        throw updateError;
      }
    } else {
      // If no preferences exist, create them
      return createUserPreferences(userId, preferences);
    }
  } catch (error) {
    throw error;
  }
};

// Judges API
export const getJudges = async (params: { limit?: number; search?: string } = {}) => {
  
  let query = supabase.from('judge').select('*');

  if (params.limit) {
    query = query.limit(params.limit);
  }

  // Search by name if provided
  if (params.search) {
    query = query.or(`first_name.ilike.%${params.search}%,last_name.ilike.%${params.search}%,full_name.ilike.%${params.search}%`);
  }

  // Sort by name (alphabetical by default)
  query = query.order('last_name', { ascending: true });

  const { data, error } = await query;

  if (error) throw error;
  return data;
};

export const getJudgeById = async (judgeId: string) => {
  
  const { data, error } = await supabase
    .from('judge')
    .select('*')
    .eq('id', judgeId)
    .single();

  if (error) throw error;
  return data;
};

export interface BillSearchResult {
  id: number;
  title: string | null;
  type: string | null;
  number: number | null;
  congress: number | null;
  bill_unique_id?: string | null;
  updated_at: string | null;
  created_at: string;
  law_enacted_date?: string | null;
  law_number?: string | null;
  law_title?: string | null;
}

export interface ExecutiveOrderSearchResult {
  id: number;
  title: string | null;
  remote_document_number: string | null;
  signing_date: string | null;
  president: string | null;
  updated_at: string | null;
  created_at: string;
  subtype: string | null;
}

export const searchBillsAndExecutiveOrders = async (query: string, limit = 25) => {
  if (!query || query.trim() === '') {
    return {
      bills: [] as BillSearchResult[],
      executiveOrders: [] as ExecutiveOrderSearchResult[],
    };
  }

  const trimmed = query.trim();
  const sanitized = trimmed.replace(/[%_]/g, (match) => `\\${match}`);
  const likePattern = `%${sanitized}%`;

  const [bills, executiveOrders] = await Promise.all([
    supabase
      .from('bill')
      .select(
        'id, title, type, number, congress, bill_unique_id, updated_at, created_at, law_enacted_date, law_number, law_title'
      )
      .or(`title.ilike.${likePattern},bill_unique_id.ilike.${likePattern},law_title.ilike.${likePattern}`)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('agency_document')
      .select('id, title, remote_document_number, signing_date, president, updated_at, created_at, subtype')
      .eq('subtype', 'Executive Order')
      .or(`title.ilike.${likePattern},remote_document_number.ilike.${likePattern}`)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  if (bills.error) {
    throw bills.error;
  }
  if (executiveOrders.error) {
    throw executiveOrders.error;
  }

  return {
    bills: (bills.data ?? []) as BillSearchResult[],
    executiveOrders: (executiveOrders.data ?? []) as ExecutiveOrderSearchResult[],
  };
};

// Global Search
export const globalSearch = async (query: string, limit = 5) => {
  
  if (!query || query.trim() === '') return { bills: [], congressmen: [], agencies: [], cases: [], judges: [], agencyDocuments: [] };

  const searchTerm = query.trim();

  // Run parallel searches across different entities
  const [bills, congressmen, agencies, clusters, judges, agencyDocs] = await Promise.all([
    // Bills search
    supabase.from('bill')
      .select('id, title, congress, number, type, bill_unique_id')
      .or(`title.ilike.%${searchTerm}%,bill_unique_id.ilike.%${searchTerm}%`)
      .limit(limit),

    // Congressmen search
    supabase.from('congressman')
      .select('id, full_name, party, state, chamber, bioguide_id')
      .or(`full_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%`)
      .limit(limit),

    // Agencies search
    supabase.from('agency')
      .select('id, name, short_name')
      .or(`name.ilike.%${searchTerm}%,short_name.ilike.%${searchTerm}%`)
      .limit(limit),

    // Court cases search
    supabase.from('cluster')
      .select('id, case_name, case_name_short')
      .or(`case_name.ilike.%${searchTerm}%,case_name_short.ilike.%${searchTerm}%`)
      .limit(limit),

    // Judges search
    supabase.from('judge')
      .select('id, full_name')
      .or(`full_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%`)
      .limit(limit),

    // Agency documents search
    supabase.from('agency_document')
      .select('id, title, type')
      .or(`title.ilike.%${searchTerm}%,abstract.ilike.%${searchTerm}%`)
      .limit(limit)
  ]);

  // Format and combine results
  return {
    bills: bills.data?.map(bill => ({
      ...bill,
      type: 'bill',
      url: `/bills/${bill.id}`,
      displayText: bill.title
    })) || [],

    congressmen: congressmen.data?.map(congressman => ({
      ...congressman,
      type: 'congressman',
      url: `/congressmen/${congressman.id}`,
      displayText: `${congressman.full_name} (${congressman.party}-${congressman.state})`
    })) || [],

    agencies: agencies.data?.map(agency => ({
      ...agency,
      type: 'agency',
      url: `/agencies/${agency.id}`,
      displayText: agency.name
    })) || [],

    cases: clusters.data?.map(cluster => ({
      ...cluster,
      type: 'case',
      url: `/supreme-court-cases/${cluster.id}`,
      displayText: cluster.case_name
    })) || [],

    judges: judges.data?.map(judge => ({
      ...judge,
      type: 'judge',
      url: `/judges/${judge.id}`,
      displayText: judge.full_name
    })) || [],

    agencyDocuments: agencyDocs.data?.map(doc => ({
      ...doc,
      type: 'agency-rule',
      url: `/agency-rules/${doc.id}`,
      displayText: doc.title
    })) || []
  };
};

// Save/Unsave Judge
export const saveJudge = async (userId: string, judgeId: string) => {
  
  try {
    const { data, error } = await supabase
      .from('saved_judge')
      .insert({
        user_id: userId,
        judge_id: judgeId
      })
      .select();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    throw error;
  }
};

export const unsaveJudge = async (userId: string, judgeId: string) => {
  
  try {
    const { error } = await supabase
      .from('saved_judge')
      .delete()
      .eq('user_id', userId)
      .eq('judge_id', judgeId);

    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    throw error;
  }
};

export const isJudgeSaved = async (userId: string, judgeId: string) => {
  
  try {
    const { data, error } = await supabase
      .from('saved_judge')
      .select('id')
      .eq('user_id', userId)
      .eq('judge_id', judgeId);

    if (error) {
      throw error;
    }

    return data && data.length > 0;
  } catch (_error) {
    return false;
  }
};

// Save/Unsave Cluster
export const saveCluster = async (userId: string, clusterId: string) => {
  
  try {
    const { data, error } = await supabase
      .from('saved_cluster')
      .insert({
        user_id: userId,
        cluster_id: clusterId
      })
      .select();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    throw error;
  }
};

export const unsaveCluster = async (userId: string, clusterId: string) => {
  
  try {
    const { error } = await supabase
      .from('saved_cluster')
      .delete()
      .eq('user_id', userId)
      .eq('cluster_id', clusterId);

    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    throw error;
  }
};

export const isClusterSaved = async (userId: string, clusterId: string) => {
  
  try {
    const { data, error } = await supabase
      .from('saved_cluster')
      .select('id')
      .eq('user_id', userId)
      .eq('cluster_id', clusterId);

    if (error) {
      throw error;
    }

    return data && data.length > 0;
  } catch (_error) {
    return false;
  }
};

// Save/Unsave Agency Document
export const saveAgencyDocument = async (userId: string, agencyDocumentId: string) => {
  
  try {
    const { data, error } = await supabase
      .from('saved_agencydocument')
      .insert({
        user_id: userId,
        agency_document_id: agencyDocumentId
      })
      .select();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    throw error;
  }
};

export const unsaveAgencyDocument = async (userId: string, agencyDocumentId: string) => {
  
  try {
    const { error } = await supabase
      .from('saved_agencydocument')
      .delete()
      .eq('user_id', userId)
      .eq('agency_document_id', agencyDocumentId);

    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    throw error;
  }
};

export const isAgencyDocumentSaved = async (userId: string, agencyDocumentId: string) => {
  
  try {
    const { data, error } = await supabase
      .from('saved_agencydocument')
      .select('id')
      .eq('user_id', userId)
      .eq('agency_document_id', agencyDocumentId);

    if (error) {
      throw error;
    }

    return data && data.length > 0;
  } catch (_error) {
    return false;
  }
};

// Get Saved Items for new types
export const getSavedJudges = async (userId: string) => {
  
  const { data, error } = await supabase
    .from('saved_judge')
    .select('*, judge(*)')
    .eq('user_id', userId);

  if (error) throw error;
  return data;
};

export const getSavedClusters = async (userId: string) => {
  
  const { data, error } = await supabase
    .from('saved_cluster')
    .select(`
      *,
      cluster(
        *,
        court(*),
        opinions:court_opinion(
          *,
          author:judge(*)
        )
      )
    `)
    .eq('user_id', userId);

  if (error) throw error;
  return data;
};

export const getSavedAgencyDocuments = async (userId: string) => {
  
  // First, get the saved agency documents with their document details
  const { data: savedDocs, error } = await supabase
    .from('saved_agencydocument')
    .select(`
      *,
      agency_document(*)
    `)
    .eq('user_id', userId);

  if (error) throw error;

  // If there are no saved documents, return empty array
  if (!savedDocs || savedDocs.length === 0) {
    return [];
  }

  // For each document, we need to find its associated agency through the join table
  const enhancedDocs = await Promise.all(
    savedDocs.map(async (savedDoc) => {
      // Find the agency_agencydocument entry for this document
      const { data: agencyLinks, error: linkError } = await supabase
        .from('agency_agencydocument')
        .select('agency_id')
        .eq('agency_document_id', savedDoc.agency_document_id)
        .limit(1);

      if (linkError) {
        console.error('Error fetching agency link:', linkError);
        return savedDoc;
      }

      // If we found an agency link, fetch the agency details
      if (agencyLinks && agencyLinks.length > 0) {
        const { data: agency, error: agencyError } = await supabase
          .from('agency')
          .select('*')
          .eq('id', agencyLinks[0].agency_id)
          .single();

        if (agencyError) {
          console.error('Error fetching agency:', agencyError);
          return savedDoc;
        }

        // Add the agency to the document
        if (agency && savedDoc.agency_document) {
          return {
            ...savedDoc,
            agency_document: {
              ...savedDoc.agency_document,
              agency
            }
          };
        }
      }

      return savedDoc;
    })
  );

  return enhancedDocs;
};

export const getBillSummary = async (billId: string): Promise<BillSummary | null> => {
  
  const { data, error } = await supabase
    .from('bill_summary')
    .select('*')
    .eq('bill', billId)
    .order('date', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data && data.length > 0 ? data[0] as BillSummary : null;
};

// Subscription & Payment API
export const getUserSubscription = async (userId: string) => {
  
  const { data, error } = await supabase
    .from('subscription')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
};

// Upsert a free subscription - creates if doesn't exist, does nothing if it exists
export const upsertSubscription = async (userId: string) => {
    const { data, error } = await supabase
      .from('subscription')
      .upsert({ user_id: userId, status: 'active'}, { onConflict: 'user_id' });
  
    if (error) throw error;
    return data;
};

export const createCheckoutSession = async (userId: string, redirectUrl: string) => {
  const response = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId, redirectUrl }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create checkout session');
  }

  const session = await response.json();
  return session.url;
};

// Upsert a user_usage row - creates if doesn't exist, does nothing if it exists
export const upsertUserUsage = async (userId: string) => {
  const { data, error } = await supabase
    .from('user_usage')
    .upsert({ user_id: userId }, { onConflict: 'user_id' });
  if (error) throw error;
  return data;
};

// Get user_usage row for a user
export const getUserUsage = async (userId: string) => {
  const { data, error } = await supabase
    .from('user_usage')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
};
