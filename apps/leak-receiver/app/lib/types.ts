export type RecordEntry = {
  id: string;
  createdAt: string;
  sourceIp?: string;
  userAgent?: string;
  name: string;
  address: string;
  phone: string;
  job: string;
  age: string;
  creditCard: string;
  rawText: string;
};

export type ParsedFields = {
  name?: string;
  address?: string;
  phone?: string;
  job?: string;
  age?: string;
  creditCard?: string;
};
