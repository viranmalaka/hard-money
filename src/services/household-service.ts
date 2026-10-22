import { apiClient } from "@/lib/api/client";

export interface HouseholdMember {
  id: string;
  householdId: string;
  userId: string;
  role: "OWNER" | "CO_OWNER" | "CONTRIBUTOR_ADD_ONLY" | "VIEWER";
  createdAt: string;
  user: { id: string; name: string; email: string };
}

export interface Household {
  id: string;
  name: string;
  ownerId: string;
  isOwner: boolean;
  myRole: HouseholdMember["role"];
  createdAt: string;
  members: HouseholdMember[];
}

export async function listHouseholds() {
  const { data } = await apiClient.get<{ households: Household[] }>("/households");
  return data.households;
}

export async function createHousehold(name: string) {
  const { data } = await apiClient.post("/households", { name });
  return data;
}

export async function inviteMember(
  householdId: string,
  input: { email: string; role: Exclude<HouseholdMember["role"], "OWNER"> }
) {
  const { data } = await apiClient.post(`/households/${householdId}/members`, input);
  return data;
}

export async function updateMemberRole(
  householdId: string,
  memberId: string,
  role: Exclude<HouseholdMember["role"], "OWNER">
) {
  const { data } = await apiClient.patch(`/households/${householdId}/members/${memberId}`, { role });
  return data;
}

export async function removeMember(householdId: string, memberId: string) {
  const { data } = await apiClient.delete(`/households/${householdId}/members/${memberId}`);
  return data;
}

export async function transferOwnership(householdId: string, newOwnerId: string) {
  const { data } = await apiClient.post(`/households/${householdId}/transfer-ownership`, { newOwnerId });
  return data;
}
