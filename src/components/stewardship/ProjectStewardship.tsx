'use client';

// ProjectStewardship — the ownership side of a unit: claim ladder, stewardship
// sweeps, forks, showcase, and roles. Mounts inside the project page; the
// platform's rule: gates exist ONLY on identity/control of a unit.

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { ProjectView } from "@/lib/projects";
import StoryEditor from "@/components/showcase/StoryEditor";
import { listShowcase, setStory, uploadImages, setGalleryOrder, type ShowcaseImage } from "@/lib/showcase";
import ShowcaseGallery from "@/components/showcase/ShowcaseGallery";
import { listProjectRoles, myRoleOnProject, OWNER_ROLE, type ProjectMember, type ProjectRole } from "@/lib/roles";
import { listLineage, type LineageNode } from "@/lib/forks";

const RENTS = [5, 10, 15, 20] as const;

type Pulse = { lastSweepAt: string | null; sweptCount: number; pendingCount: number } | null;

export function ProjectStewardship({
  project,
  authed,
  myProfileId,
  onChanged,
}: {
  project: ProjectView;
  authed: boolean;
  myProfileId: string | null;
  onChanged?: () => void;
}) {
  const [pulse, setPulse] = useState<Pulse>(null);
  const [claiming, setClaiming] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [forking, setForking] = useState(false);
  const [forkName, setForkName] = useState("");
  const [forkRent, setForkRent] = useState<number>(10);
  const [notice, setNotice] = useState<string | null>(null);
  const [roles, setRoles] = useState<ProjectMember[]>([]);
  const [lineage, setLineage] = useState<LineageNode[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [myRole, setMyRole] = useState<ProjectRole | null>(null);
  const live = useRef(true);
  const [images, setImages] = useState<ShowcaseImage[]>([]);
  const [storyState, setStoryState] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

  const canEdit = Boolean(authed && (isOwner || myRole === "manager"));

  const refresh = useCallback(async () => {
    if (!getSupabase()) {
      setPulse({ lastSweepAt: "mock", sweptCount: 2, pendingCount: 1 });
      try {
        const lin = await listLineage(project.id);
        if (live.current) setLineage(lin ?? []);
      } catch { /* lineage optional in mock */ }
      setMyRole(OWNER_ROLE);
      setIsOwner(true);
      return;
    }
    const { stewardshipPulse } = await import("@/lib/sweeps");
    try {
      const p = (await stewardshipPulse(project.id)) as Pulse;
      if (live.current) setPulse(p);
    } catch { /* pulse read failure is not fatal */ }
    try {
      const sh = await listShowcase(project.id);
      if (live.current) {
        setImages(sh?.images ?? []);
        setStoryState(sh?.story ?? null);
      }
    } catch { /* showcase optional */ }
    try {
      const r = await listProjectRoles(project.id);
      if (live.current) setRoles(r ?? []);
      const mine = await myRoleOnProject(project.id, myProfileId ?? "");
      const ownedByMe = project.creatorId === myProfileId || mine === OWNER_ROLE;
      if (live.current) {
        setIsOwner(ownedByMe);
        setMyRole(mine ?? null);
      }
    } catch { /* roles optional */ }
    try {
      const lin = await listLineage(project.id);
      if (live.current) setLineage(lin ?? []);
    } catch { /* lineage optional */ }
  }, [project, myProfileId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function claim() {
    setClaiming(true); setNotice(null);
    try {
      const s = getSupabase();
      let providerToken: string | undefined;
      let githubLogin: string | undefined;
      if (s) {
        const sess = (await s.auth.getSession()).data.session;
        providerToken = sess?.provider_token ?? undefined;
        const identities = sess?.user?.identities ?? [];
        const gh = identities.find((i) => i.provider === "github");
        githubLogin = (gh?.identity_data as { user_name?: string } | undefined)?.user_name ?? undefined;
      }
      const res = await fetch("/api/claims/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, providerToken, githubLogin }),
      });
      const data = (await res.json()) as { verified?: boolean; method?: string; error?: string; fallback?: boolean };
      if (data.verified) {
        setNotice("claim verified via " + (data.method ?? "github") + " — you are the maintainer now");
        onChanged?.();
      } else if (data.fallback) {
        setNotice("claim request filed for steward review (rung 4)");
      } else {
        setNotice(data.error ?? "could not verify control of this repo yet — try a claim file or manual review");
      }
      await refresh();
    } catch {
      setNotice("claim check failed — try again");
    } finally {
      setClaiming(false);
    }
  }

  async function sweep() {
    setSweeping(true); setNotice(null);
    try {
      const res = await fetch("/api/sweeps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      const data = (await res.json()) as { sweptCount?: number };
      setNotice("swept " + (data.sweptCount ?? 0) + " token entries — stewardship pulse updated");
      await refresh();
    } catch {
      setNotice("sweep failed — try again");
    } finally {
      setSweeping(false);
    }
  }

  async function createFork() {
    if (!forkName.trim()) { setNotice("name the fork first"); return; }
    setForking(true); setNotice(null);
    try {
      const res = await fetch("/api/forks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentProjectId: project.id, newTitle: forkName.trim(), forkerProfileId: myProfileId, forkRentPct: forkRent }),
      });
      const data = (await res.json()) as { project?: { id?: string }; error?: string };
      if (data.project) setNotice("fork created — it is yours now; fund it directly or find it in Discover");
      else setNotice(data.error ?? "fork failed");
      await refresh();
    } catch {
      setNotice("fork failed — try again");
    } finally {
      setForking(false);
    }
  }

  return (
    <div className="space-y-4">
      {!authed && project.claimStatus === "unclaimed" && (
        <p className="mono border border-line bg-panel2 px-3 py-2 text-[11px] text-dim">
          maintainer of {project.originRepo ?? "this project"}?{" "}
          <a href="/auth" className="text-phos underline-offset-2 hover:underline">
            sign in with github to claim
          </a>{" "}
          — everything else stays open.
        </p>
      )}

      {(project.claimStatus === "unclaimed" || project.claimStatus === "claimed") && (
        <div className="mono flex flex-wrap items-center gap-3 border border-line bg-panel px-4 py-3 text-[11px]">
          {project.claimStatus === "unclaimed" && (
            <button
              type="button"
              onClick={() => void claim()}
              disabled={!authed || claiming}
              className="border border-amber px-3 py-1.5 uppercase tracking-[0.1em] text-amber transition enabled:hover:bg-amber/10 disabled:opacity-40"
            >
              {claiming ? "verifying..." : "maintainers: claim it"}
            </button>
          )}
          {project.claimStatus === "claimed" && (isOwner || authed) && (
            <button
              type="button"
              onClick={() => void sweep()}
              disabled={sweeping || !authed || !isOwner}
              title={isOwner ? "claim incoming tokens now" : "only the owner sweeps"}
              className="border border-phos px-3 py-1.5 uppercase tracking-[0.1em] text-phos transition enabled:hover:bg-phos/10 disabled:opacity-40"
            >
              {sweeping ? "sweeping..." : "claim available tokens"}
            </button>
          )}
          <span className="text-dim">
            {project.claimStatus === "claimed" ? <span className="live" /> : "◐"} stewardship pulse:{" "}
            {pulse ? (pulse.lastSweepAt === "mock" ? "mock data" : pulse.lastSweepAt ? new Date(pulse.lastSweepAt).toLocaleString() : "no sweep yet") : "..."}
            {pulse ? ` · swept ${pulse.sweptCount} · pending ${pulse.pendingCount}` : ""}
          </span>
        </div>
      )}

      {notice && (
        <p className="mono border border-phos bg-phos/5 px-3 py-2 text-[11px] text-phos" data-testid="stewardship-notice">
          &gt; {notice}
        </p>
      )}

      {lineage.length > 0 && (
        <div className="mono flex flex-wrap items-center gap-1 border border-line bg-panel2 px-3 py-2 text-[10px] text-dim">
          <span className="uppercase tracking-[0.14em]">lineage:</span>
          {lineage
            .slice()
            .sort((a, b) => b.depth - a.depth)
            .map((n, i) => (
              <span key={n.projectId + i}>
                {i > 0 && <span className="mx-1">→</span>}
                <span className="text-tx">{n.title}</span>
                {n.depth > 0 && n.forkRentPct != null && (
                  <span className="text-amber"> ({n.forkRentPct}% up)</span>
                )}
              </span>
            ))}
        </div>
      )}

      {authed && (
        <div className="mono flex flex-wrap items-center gap-2 border border-line bg-panel px-4 py-3 text-[11px]">
          <span className="uppercase tracking-[0.14em] text-dim">fork this unit</span>
          <input
            value={forkName}
            onChange={(e) => setForkName(e.target.value)}
            placeholder="new fork title..."
            className="mono w-48 border border-line bg-bg px-2 py-1 text-[11px] text-tx outline-none placeholder:text-dim"
          />
          <span className="flex gap-1">
            {RENTS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setForkRent(r)}
                title={"upstream rent per hop (locked at fork time)"}
                className={`border px-2 py-1 transition ${forkRent === r ? "border-phos text-phos" : "border-line text-dim hover:border-phos"}`}
              >
                {r}%
              </button>
            ))}
          </span>
          <button
            type="button"
            onClick={() => void createFork()}
            disabled={forking}
            className="border border-phos bg-phos px-3 py-1.5 uppercase tracking-[0.1em] text-bg transition enabled:hover:opacity-90 disabled:opacity-40"
          >
            {forking ? "forking..." : "create fork"}
          </button>
          <span className="text-[10px] text-dim">rate locks at fork birth · lineage is public</span>
        </div>
      )}

      {roles.length > 0 && (
        <div className="mono flex flex-wrap items-center gap-2 border border-line bg-panel2 px-3 py-2 text-[10px] text-dim">
          <span className="uppercase tracking-[0.14em]">roles:</span>
          {roles.map((r, i) => (
            <span key={r.memberProfileId + i} className="border border-line px-2 py-0.5 text-tx">
              {r.displayName ?? r.memberProfileId.slice(0, 8)} · {r.role}
            </span>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="mono flex flex-wrap items-center gap-3 border border-line bg-panel px-4 py-3 text-[11px]">
          <span className="text-dim">showcase:</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="mono hidden"
            id={`showcase-files-${project.id}`}
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              if (!files.length) return;
              setUploadingFiles(true); setUploadError(null);
              try {
                const res = await uploadImages(project.id, files);
                if (res && "error" in res) setUploadError(res.error ?? "upload failed");
              } catch {
                setUploadError("upload failed");
              } finally {
                setUploadingFiles(false);
                e.target.value = "";
                await refresh();
              }
            }}
          />
          <label
            htmlFor={`showcase-files-${project.id}`}
            className="mono cursor-pointer border border-line px-3 py-1.5 text-tx transition hover:border-phos hover:text-phos"
          >
            {uploadingFiles ? "uploading..." : "add images (max 8)"}
          </label>
          {uploadError && <span className="text-amber">{uploadError}</span>}
        </div>
      )}

      <ShowcaseGallery
        images={images}
        imageAltBase={project.title}
        fallbackImageUrl={project.imageUrl}
        editable={canEdit}
        uploading={uploadingFiles}
        uploadError={uploadError}
        onRemove={async (image) => {
          await fetch("/api/uploads", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId: project.id, url: image.url }),
          }).catch(() => null);
          await refresh();
        }}
        onReorder={async (ordered) => {
          await setGalleryOrder(project.id, ordered.map((img) => img.storagePath)).catch(() => null);
        }}
      />
      <StoryEditor
        story={storyState}
        saving={saveBusy}
        disabled={!canEdit}
        onSave={async (next) => {
          setSaveBusy(true);
          try {
            await setStory(project.id, next);
            setStoryState(next);
          } finally {
            setSaveBusy(false);
          }
        }}
      />
    </div>
  );
}