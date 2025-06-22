export interface Bill {
  id: string;
  congress: number;
  type: string;
  number: string;
  title: string;
  introduced_date?: string;
  policy_area?: string;
  bill_unique_id?: string;
  law_enacted_date?: string;
  sponsor?: { congressman: Congressman }
  cosponsors?: ({ congressman: Congressman }[])
  most_recent_action?: {
    id: string;
    date: string;
    text: string;
    type: string;
  } | null;
}

export interface BillText {
  id: string;
  bill_id: string;
  pdf_url?: string;
  html_url?: string;
  xml_url?: string;
  date?: string;
  pdf_file_path?: string;
  html_file_path?: string;
  xml_file_path?: string;
}

export interface Law {
  id: string;
  congress: number;
  type: string;
  number: string;
  title: string;
  policy_area: string;
  introduced_date: string;
  law_enacted_date: string;
  law_number: string;
  law_type: string;
  law_unique_id: string;
  law_title: string;
  sponsor: Congressman;
  most_recent_action?: {
    id: string;
    date: string;
    text: string;
    type: string;
  } | null;
}

export interface LawText {
  id: string;
  law_id: string;
  pdf_url?: string;
  html_url?: string;
  xml_url?: string;
  date?: string;
  pdf_file_path?: string;
  html_file_path?: string;
  xml_file_path?: string;
}

export interface Congressman {
  id: string;
  full_name: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  party: string;
  state: string;
  district?: string;
  phone?: string;
  website?: string;
  address?: string;
  bioguide_id?: string;
  chamber?: string;
}

export interface CongressmanTerm {
  id: string;
  congressman_id: string;
  start_year: string;
  end_year?: string;
  state: string;
  district?: string;
  chamber: string;
  congress: number;
}

export interface SavedBill {
  id: string;
  bill_id: string;
  user_id: string;
  bill?: Bill;
  created_at?: string;
}

export interface SavedCongressman {
  id: string;
  congressman_id: string;
  user_id: string;
  congressman?: Congressman;
  created_at?: string;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
}

export interface Agency {
  id: string;
  remote_agency_id: number;
  url: string;
  name: string;
  short_name: string;
  description?: string;
  remote_parent_id?: number;
  parent_id?: string;
  parent?: Agency;
}

export interface SavedAgency {
  id: string;
  agency_id: string;
  user_id: string;
  agency?: Agency;
  created_at?: string;
}

export interface AgencyDocument {
  id: string;
  title: string;
  type: string;
  publication_date: string;
  pdf_url: string;
  html_url: string;
  xml_url: string;
  pdf_file_path: string;
  html_file_path: string;
  xml_file_path: string;
  abstract: string;
  remote_document_number: string;
  signing_date?: string;
  subtype?: string;
  president?: string;
  agency?: Agency;
}

export interface Court {
  id: number;
  full_name: string;
  jurisdiction: string;
  short_name: string;
}

export interface Judge {
  id: string;
  remote_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  full_name: string;
}

export interface CourtOpinion {
  id: string;
  remote_id?: string;
  title: string;
  date: string;
  pdf_file_path?: string;
  text_file_path?: string;
  html_file_path?: string;
  author_id: string;
  court_id: string;
  created_at?: string;
  updated_at?: string;
  court?: Court;
  author?: Judge;
  cluster?: Cluster;
  type?: string;
  joined_by: Judge[];
}

export interface Cluster {
  id: string;
  remote_id: string;
  court_id: number;
  court: Court;
  slug: string;
  case_name: string;
  case_name_short: string;
  opinions: CourtOpinion[];
  date_filed: string;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  states: string[];
  policy_areas: string[];
  created_at?: string;
  updated_at?: string;
}

export interface SavedJudge {
  id: string;
  judge_id: string;
  user_id: string;
  judge?: Judge;
  created_at?: string;
}

export interface SavedCluster {
  id: string;
  cluster_id: string;
  user_id: string;
  cluster?: Cluster;
  created_at?: string;
}

export interface SavedAgencyDocument {
  id: string;
  agency_document_id: string;
  user_id: string;
  agency_document?: AgencyDocument;
  created_at?: string;
}

export interface SaveItemType {
  itemType: 'congressman' | 'bill' | 'agency' | 'judge' | 'cluster' | 'agencyDocument';
}

export type PolicyArea =
  | 'Agriculture and Food'
  | 'Animals'
  | 'Armed Forces and National Security'
  | 'Arts, Culture, Religion'
  | 'Civil Rights and Liberties, Minority Issues'
  | 'Commerce'
  | 'Commemorations'
  | 'Congress'
  | 'Crime and Law Enforcement'
  | 'Economics and Public Finance'
  | 'Education'
  | 'Emergency Management'
  | 'Energy'
  | 'Environmental Protection'
  | 'Families'
  | 'Finance and Financial Sector'
  | 'Foreign Trade and International Finance'
  | 'Government Operations and Politics'
  | 'Health'
  | 'Housing and Community Development'
  | 'Immigration'
  | 'International Affairs'
  | 'Labor and Employment'
  | 'Law'
  | 'Native Americans'
  | 'Private Legislation'
  | 'Public Lands and Natural Resources'
  | 'Science, Technology, Communications'
  | 'Social Sciences and History'
  | 'Social Welfare'
  | 'Sports and Recreation'
  | 'Taxation'
  | 'Transportation and Public Works'
  | 'Water Resources Development';

export interface BillSummary {
  id: string;
  bill: string;
  date?: string;
  text: string;
  created_at?: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id?: string;
  status: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
  created_at?: string;
  updated_at?: string;
  tier: 'free' | 'paid';
  plan_name?: string;
}

export interface Payment {
  id: string;
  user_id: string;
  subscription_id?: string;
  stripe_invoice_id: string;
  amount: number;
  currency: string;
  status: string;
  paid_at?: string;
  created_at?: string;
  receipt_url?: string;
}
