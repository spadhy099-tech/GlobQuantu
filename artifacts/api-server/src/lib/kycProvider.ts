export type KycSubmission = {
  userId: string;
  fullName: string;
  dateOfBirth: Date;
  country: string;
};

export type KycProviderResult = {
  providerReference: string;
  status: "pending" | "approved" | "rejected" | "expired";
  riskLevel?: "low" | "medium" | "high";
  riskFlags?: string[];
};

export interface KycProvider {
  createVerification(input: KycSubmission): Promise<KycProviderResult>;
  getVerification(providerReference: string): Promise<KycProviderResult>;
  deleteApplicantData(providerReference: string): Promise<void>;
}

export function getKycProvider(): KycProvider | null {
  // A real provider adapter must be selected and configured before KYC
  // submissions are accepted. Never treat manual UI input as verification.
  return null;
}
