// Team ratings + profiles — Supabase when configured, mockDb when not (plan Task 11).

import { z } from "zod";
import { getSupabase } from "@/lib/supabase";
import { mockDb } from "@/lib/mock-db";
import type { Rating, TeamProfile } from "@/types/compute-fund";

export const ratingInputSchema = z.object({
  raterId: z.string().min(1),
  teamId: z.string().min(1),
  milestoneId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  review: z.string().max(2000).nullish(),
});

export type RatingInput = z.input<typeof ratingInputSchema>;
export type RatingSubmitResult =
  | { ok: true; rating: Rating }
  | { ok: false; error: string };

/** Submit one 1-5 rating (optional review) attached to a milestone run. */
export async function submitRating(input: RatingInput): Promise<RatingSubmitResult> {
  const parsed = ratingInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue ? `${issue.path.join(".") || "input"}: ${issue.message}` : "invalid input" };
  }
  const v = parsed.data;
  const db = getSupabase();
  if (!db) {
    const rating: Rating = {
      id: `rt-${Date.now()}-${v.raterId}`,
      teamId: v.teamId,
      raterId: v.raterId,
      milestoneId: v.milestoneId,
      rating: v.rating,
      review: v.review ?? null,
      createdAt: new Date().toISOString(),
    };
    mockDb.addRating(rating);
    return { ok: true, rating };
  }
  const row = {
    team_id: v.teamId,
    rater_id: v.raterId,
    milestone_id: v.milestoneId,
    rating: v.rating,
    review: v.review ?? null,
  };
  const { data, error } = await db.from("team_ratings").insert(row).select().single();
  if (error) return { ok: false, error: error.message };
  const rating = data as Rating;
  // keep mock aggregate in sync so profiles read consistently in either mode
  mockDb.addRating({
    ...rating,
    id: rating.id,
    createdAt: rating.createdAt ?? new Date().toISOString(),
  });
  return { ok: true, rating };
}

export async function getTeamProfile(teamId: string): Promise<TeamProfile | null> {
  const db = getSupabase();
  if (!db) return mockDb.teams.find((t) => t.id === teamId) ?? null;
  const { data, error } = await db
    .from("profiles")
    .select("id, name, is_team, team_rating, rating_count, token_balance")
    .eq("id", teamId)
    .maybeSingle();
  if (error || !data) return mockDb.teams.find((t) => t.id === teamId) ?? null;
  return {
    id: data.id,
    name: data.name,
    isTeam: data.is_team,
    teamRating: data.team_rating ?? 0,
    ratingCount: data.rating_count ?? 0,
    tokenBalance: data.token_balance ?? 0,
  };
}

export type TeamReview = {
  id: string;
  raterId: string;
  rating: number;
  review: string;
  createdAt: string;
};

/** Recent written reviews for a team, newest first. */
export async function listTeamReviews(teamId: string, limit = 10): Promise<TeamReview[]> {
  const db = getSupabase();
  const toReview = (r: Rating): TeamReview | null =>
    r.review ? { id: r.id, raterId: r.raterId, rating: r.rating, review: r.review, createdAt: r.createdAt } : null;

  if (!db) {
    return mockDb.ratings
      .filter((r) => r.teamId === teamId && r.review)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(toReview)
      .filter((r): r is TeamReview => r !== null);
  }
  const { data, error } = await db
    .from("team_ratings")
    .select("id, rater_id, rating, review, created_at")
    .eq("team_id", teamId)
    .not("review", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    raterId: r.rater_id,
    rating: r.rating,
    review: r.review as string,
    createdAt: r.created_at,
  }));
}