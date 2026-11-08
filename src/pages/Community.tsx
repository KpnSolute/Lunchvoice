// Track C: the community surface (custom pages, Newsroom, comments, leaderboard, Shop) inside the L10 Hub shell, and
// the public Discover directory. Every rule is enforced by lv_api (000020); the UI only shows what the API returns.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import type { HubMembership, HubPage, LvError } from "../lib/lvApi";
import type { CommentRow, DiscoverHub, NewsPost, ShopItem } from "../lib/communityApi";
import { describeError } from "../lib/errors";
import { parseMarkdownLite, type Span } from "../lib/markdownLite";
import type { HubCtx } from "./Hub";
import { LinkButton } from "../components/ui";
import { Icon } from "../components/Icon";
import { HubMark } from "../ui/HubMark";
import { accentHex, onAccent } from "../lib/accent";
import { StateScreen } from "../ui/StateScreen";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { Switch } from "@/components/shadcn/switch";
import { Badge } from "@/components/shadcn/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { EmptyState, Eyebrow, Field, LoadingRows, Metric, NavTabs, Notice, SectionTitle, Segmented, ToggleRow } from "@/components/shadcn/blocks";
import "../ui/community.css";

const useHub = () => useOutletContext<HubCtx>();
const can = (m: HubMembership | null, cap: string) => Boolean(m?.is_owner || m?.capabilities.includes(cap));
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "");

/* ------------------------------------------------------------------ safe content */

function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((s, i) =>
        s.t === "link" ? <a key={i} href={s.href} target="_blank" rel="noopener noreferrer nofollow ugc">{s.text}</a>
        : s.t === "strong" ? <strong key={i}>{s.text}</strong>
        : <span key={i}>{s.text}</span>,
      )}
    </>
  );
}

/** Markdown-lite rendered as React text nodes only: never HTML, links only for http(s) and mailto. */
export function Markdown({ source, className }: { source: string | null | undefined; className?: string }) {
  const blocks = useMemo(() => parseMarkdownLite(source), [source]);
  if (!blocks.length) return null;
  return (
    <div className={`lv-cm-prose ${className ?? ""}`} data-testid="markdown">
      {blocks.map((b, i) =>
        b.t === "h" ? (b.level === 2 ? <h2 key={i}><Spans spans={b.spans} /></h2> : <h3 key={i}><Spans spans={b.spans} /></h3>)
        : b.t === "ul" ? <ul key={i}>{b.items.map((it, j) => <li key={j}><Spans spans={it} /></li>)}</ul>
        : <p key={i}><Spans spans={b.spans} /></p>,
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Hub page navigation */

const ROUTE: Record<string, string> = { news: "news", leaderboard: "leaderboard", shop: "shop", comments: "comments" };

/** Links to every Hub page this person can see (from lv_hub_pages_get: members-only pages never reach visitors). */
export function CommunityNav({ slug, hubId }: { slug: string; hubId: string }) {
  const { api } = useIdentity();
  const q = useLv(() => api.hubPagesGet(hubId), [api, hubId]);
  // The Builder announces a save so the navigation follows without a reload.
  useEffect(() => {
    const on = () => q.reload();
    window.addEventListener("lv:pages-changed", on);
    return () => window.removeEventListener("lv:pages-changed", on);
  });
  const pages = (q.data?.pages ?? []).filter((p) => p.enabled && p.kind !== "home" && p.kind !== "campaigns");
  if (!pages.length) return null;
  const items = [
    { to: `/${slug}`, label: "Home", end: true },
    ...pages.map((p) => ({ to: p.kind === "custom" ? `/${slug}/p/${p.key}` : `/${slug}/${ROUTE[p.kind]}`, label: p.title })),
  ];
  return <div className="lv-cm-nav" data-testid="hub-pages-nav"><NavTabs items={items} label="Hub pages" /></div>;
}

/* ------------------------------------------------------------------ shared states */

function Blocked({ error, what }: { error: LvError; what: string }) {
  const { hub } = useHub();
  const { session } = useIdentity();
  const back = <LinkButton to={`/${hub.slug}`} variant="secondary">Back to {hub.name}</LinkButton>;
  if (error.code === "lv_unauthenticated" || (!session && error.code === "lv_forbidden"))
    return <StateScreen kind="ineligible" title={`Sign in to see the ${what}.`} detail="It is for members of this Hub." action={<LinkButton to="/signin" state={{ from: `/${hub.slug}` }} variant="primary">Sign in</LinkButton>} />;
  if (error.code === "lv_forbidden") return <StateScreen kind="ineligible" title={`The ${what} is for members.`} detail="Join this Hub to take part. Guests never post or earn points." action={back} />;
  if (error.code === "lv_not_available") return <StateScreen kind="empty" title={`This Hub hasn’t turned the ${what} on.`} detail="The Hub Owner chooses which pages a Hub shows." action={back} />;
  if (error.code === "lv_not_found") return <StateScreen kind="notfound" title="We can’t find that." detail="It may have been removed, or it may be for members only." action={back} />;
  return <Notice tone="error">{describeError(error)}</Notice>;
}

function PageHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="lv-cm-head">
      <div><Eyebrow accent>{eyebrow}</Eyebrow><h2 className="lv-cm-title">{title}</h2></div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ custom page */

export function CustomPage() {
  const { hub } = useHub();
  const { page: key } = useParams();
  const { api } = useIdentity();
  const q = useLv(() => api.hubPagesGet(hub.hub_id), [api, hub.hub_id]);
  if (q.loading && !q.data) return <LoadingRows rows={3} />;
  if (q.error) return <Blocked error={q.error} what="page" />;
  const page = q.data?.pages.find((p) => p.kind === "custom" && p.key === key && p.enabled);
  if (!page) return <Blocked error={{ code: "lv_not_found", message: "" }} what="page" />;
  return (
    <article className="lv-cm-stack" data-testid="custom-page">
      <PageHead eyebrow="Hub page" title={page.title}>{page.visibility === "public" && <Badge variant="outline">Public</Badge>}</PageHead>
      <Card>{page.body?.trim() ? <Markdown source={page.body} /> : <p className="ui-muted lv-m0">This page has no content yet.</p>}</Card>
    </article>
  );
}

/* ------------------------------------------------------------------ Newsroom */

function Composer({ hubId, publicHub, post, onDone }: { hubId: string; publicHub: boolean; post?: NewsPost; onDone: () => void }) {
  const { api } = useIdentity();
  const [title, setTitle] = useState(post?.title ?? "");
  const [body, setBody] = useState(post?.body ?? "");
  const [vis, setVis] = useState<"members" | "public">(post?.visibility ?? "members");
  const [busy, setBusy] = useState(false);
  async function save(publish: boolean) {
    setBusy(true);
    const r = await api.newsSave(hubId, title.trim(), body, vis, post?.post_id);
    if (r.ok && publish && r.post.status !== "published") {
      const p = await api.newsPublish(r.post.post_id, true);
      if (!p.ok) { setBusy(false); toast.error(describeError(p.error)); return; }
    }
    setBusy(false);
    if (!r.ok) { toast.error(describeError(r.error)); return; }
    toast.success(publish ? "Post published" : "Draft saved");
    if (!post) { setTitle(""); setBody(""); }
    onDone();
  }
  return (
    <Card data-testid="news-composer">
      <SectionTitle>{post ? "Edit post" : "Write a post"}</SectionTitle>
      <Field label="Title" htmlFor={`nt-${post?.post_id ?? "new"}`} counter={{ value: title.length, max: 140 }}>
        <Input id={`nt-${post?.post_id ?? "new"}`} value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} placeholder="What changed because of your answers" />
      </Field>
      <Field label="Post" htmlFor={`nb-${post?.post_id ?? "new"}`} help="Plain text. # for a heading, - for a list, [text](https://…) for a link. No HTML.">
        <Textarea id={`nb-${post?.post_id ?? "new"}`} value={body} rows={6} maxLength={20000} onChange={(e) => setBody(e.target.value)} />
      </Field>
      {publicHub ? (
        <Field label="Who can read it"><Segmented label="Who can read it" value={vis} onValueChange={setVis} options={[{ value: "members", label: "Members" }, { value: "public", label: "Anyone (public)" }]} /></Field>
      ) : <p className="ui-help lv-m0">This Hub is private, so posts are for members only.</p>}
      <div className="ui-row">
        <Button variant="secondary" disabled={!title.trim() || busy} onClick={() => save(false)}>Save draft</Button>
        <Button variant="primary" disabled={!title.trim() || busy} onClick={() => save(true)}>{busy ? "Saving…" : "Publish"}</Button>
        {post && <Button variant="quiet" onClick={onDone}>Cancel</Button>}
      </div>
    </Card>
  );
}

function PostActions({ post, onChange }: { post: NewsPost; onChange: () => void }) {
  const { api } = useIdentity();
  const run = async (p: Promise<{ ok: boolean; error?: LvError }>, done: string) => {
    const r = await p;
    if (r.ok) { toast.success(done); onChange(); } else toast.error(describeError(r.error!));
  };
  return (
    <div className="ui-row">
      {post.status === "draft"
        ? <Button size="sm" variant="primary" onClick={() => run(api.newsPublish(post.post_id, true), "Published")}>Publish</Button>
        : <Button size="sm" variant="quiet" onClick={() => run(api.newsPublish(post.post_id, false), "Moved to drafts")}>Unpublish</Button>}
      {post.status === "published" && <Button size="sm" variant="quiet" onClick={() => run(api.newsPin(post.post_id, !post.pinned), post.pinned ? "Unpinned" : "Pinned")}>{post.pinned ? "Unpin" : "Pin"}</Button>}
      <Button size="sm" variant="quiet" onClick={() => run(api.newsDelete(post.post_id), "Post and its comments deleted")}>Delete</Button>
    </div>
  );
}

export function NewsPage() {
  const { hub, membership } = useHub();
  const { api } = useIdentity();
  const poster = can(membership, "community.post");
  const q = useLv(() => api.newsList(hub.hub_id, poster), [api, hub.hub_id, poster]);
  const [editing, setEditing] = useState<string | null>(null);
  if (q.loading && !q.data) return <LoadingRows rows={3} label="Loading posts" />;
  if (q.error) return <Blocked error={q.error} what="Newsroom" />;
  const posts = q.data!.posts;
  return (
    <div className="lv-cm-stack" data-testid="newsroom">
      <PageHead eyebrow="Newsroom" title={`News from ${hub.name}`} />
      {q.data!.can_post && <Composer hubId={hub.hub_id} publicHub={hub.visibility === "public"} onDone={q.reload} />}
      {posts.length === 0 ? (
        <Card variant="well"><EmptyState icon={<Icon name="voice" size={22} />} title="No posts yet">Updates from the Hub appear here.</EmptyState></Card>
      ) : posts.map((p) => editing === p.post_id ? (
        <Composer key={p.post_id} hubId={hub.hub_id} publicHub={hub.visibility === "public"} post={p} onDone={() => { setEditing(null); q.reload(); }} />
      ) : (
        <Card key={p.post_id} data-testid="news-post">
          <div className="lv-cm-postmeta">
            {p.pinned && <Badge variant="accent">Pinned</Badge>}
            {p.status === "draft" && <Badge>Draft</Badge>}
            {p.visibility === "public" && <Badge variant="outline">Public</Badge>}
            <span className="ui-muted lv-small">{p.author_name ?? "Hub team"}{p.published_at ? ` · ${fmt(p.published_at)}` : ""}</span>
          </div>
          <h3 className="lv-cm-posttitle">{p.status === "published" ? <Link to={`/${hub.slug}/news/${p.post_id}`}>{p.title}</Link> : p.title}</h3>
          <Markdown source={p.body.length > 600 ? p.body.slice(0, 600) + "…" : p.body} />
          <div className="ui-row lv-cm-spread">
            {p.comment_count !== null && p.status === "published" ? <Link className="lv-small" to={`/${hub.slug}/news/${p.post_id}`}>{p.comment_count} comment{p.comment_count === 1 ? "" : "s"}</Link> : <span />}
            {q.data!.can_post && <div className="ui-row"><Button size="sm" variant="quiet" onClick={() => setEditing(p.post_id)}>Edit</Button><PostActions post={p} onChange={q.reload} /></div>}
          </div>
        </Card>
      ))}
    </div>
  );
}

export function PostPage() {
  const { hub } = useHub();
  const { post: id } = useParams();
  const { api } = useIdentity();
  const q = useLv(() => api.newsGet(id!), [api, id]);
  if (q.loading && !q.data) return <LoadingRows rows={3} label="Loading post" />;
  if (q.error) return <Blocked error={q.error} what="post" />;
  const p = q.data!.post;
  return (
    <article className="lv-cm-stack" data-testid="news-post-page">
      <Link className="lv-small" to={`/${hub.slug}/news`}>← Newsroom</Link>
      <PageHead eyebrow={p.pinned ? "Pinned post" : "News"} title={p.title} />
      <p className="ui-muted lv-small lv-m0">{p.author_name ?? "Hub team"}{p.published_at ? ` · ${fmt(p.published_at)}` : ""}</p>
      <Card><Markdown source={p.body} /></Card>
      {q.data!.comments_enabled && <CommentThread hubId={hub.hub_id} postId={p.post_id} />}
    </article>
  );
}

/* ------------------------------------------------------------------ comments */

function ReportDialog({ comment, onClose, onDone }: { comment: CommentRow | null; onClose: () => void; onDone: () => void }) {
  const { api } = useIdentity();
  const [reason, setReason] = useState("");
  useEffect(() => setReason(""), [comment]);
  return (
    <Dialog open={Boolean(comment)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this comment</DialogTitle>
          <DialogDescription>Moderators of this Hub see that it was reported and why. The author is not told who reported it.</DialogDescription>
        </DialogHeader>
        <Field label="What is wrong?" htmlFor="report-reason" counter={{ value: reason.length, max: 500 }}>
          <Textarea id="report-reason" value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="ui-row">
          <Button variant="primary" disabled={!reason.trim()} onClick={async () => {
            const r = await api.commentReport(comment!.comment_id, reason.trim());
            if (r.ok) { toast.success(r.already_reported ? "Already reported" : "Reported to the moderators"); onDone(); } else toast.error(describeError(r.error));
          }}>Send report</Button>
          <Button variant="quiet" onClick={onClose}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CommentThread({ hubId, postId }: { hubId: string; postId?: string | null }) {
  const { api } = useIdentity();
  const q = useLv(() => api.commentList(hubId, postId ?? null), [api, hubId, postId]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState<CommentRow | null>(null);
  if (q.loading && !q.data) return <LoadingRows rows={2} label="Loading comments" />;
  if (q.error) return <Blocked error={q.error} what="comments" />;
  const d = q.data!;
  const act = async (p: Promise<{ ok: boolean; error?: LvError }>, done: string) => {
    const r = await p;
    if (r.ok) { toast.success(done); q.reload(); } else toast.error(describeError(r.error!));
  };
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await api.commentAdd(hubId, body.trim(), postId ?? null);
    setBusy(false);
    if (r.ok) { setBody(""); q.reload(); } else toast.error(describeError(r.error));
  }
  return (
    <section className="lv-cm-stack" data-testid="comments" aria-label="Comments">
      <SectionTitle>Comments</SectionTitle>
      <p className="ui-muted lv-small lv-m0">Be kind and keep it on topic: <Link to="/guidelines">Community Guidelines</Link>.</p>
      {d.comments.length === 0 && <p className="ui-muted lv-m0">No comments yet.</p>}
      <ul className="lv-cm-comments">
        {d.comments.map((c) => (
          <li key={c.comment_id} className="lv-cm-comment" data-hidden={c.hidden ? "" : undefined} data-testid="comment">
            <div className="lv-cm-postmeta">
              <strong>{c.author_name}</strong>
              <span className="ui-muted lv-small">{fmt(c.created_at)}</span>
              {c.hidden && <Badge variant="danger">Hidden</Badge>}
              {d.can_moderate && (c.report_count ?? 0) > 0 && <Badge variant="outline">{c.report_count} report{c.report_count === 1 ? "" : "s"}</Badge>}
            </div>
            <p className="lv-m0 lv-cm-commentbody">{c.body}</p>
            <div className="ui-row">
              {!c.mine && !c.reported_by_me && <Button size="sm" variant="quiet" onClick={() => setReporting(c)}>Report</Button>}
              {c.reported_by_me && <span className="ui-muted lv-small">You reported this</span>}
              {d.can_moderate && <Button size="sm" variant="quiet" onClick={() => act(api.commentHide(c.comment_id, !c.hidden), c.hidden ? "Comment shown" : "Comment hidden")}>{c.hidden ? "Unhide" : "Hide"}</Button>}
              {(c.mine || d.can_moderate) && <Button size="sm" variant="quiet" onClick={() => act(api.commentDelete(c.comment_id), "Comment deleted")}>Delete</Button>}
            </div>
          </li>
        ))}
      </ul>
      {d.can_comment ? (
        <form className="lv-cm-stack" onSubmit={add}>
          <Field label="Add a comment" htmlFor={`cbody-${postId ?? "wall"}`} counter={{ value: body.length, max: d.max_length }} help="Comments are public to members and show your name.">
            <Textarea id={`cbody-${postId ?? "wall"}`} value={body} rows={3} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <div><Button type="submit" variant="primary" disabled={!body.trim() || body.length > d.max_length || busy}>{busy ? "Posting…" : "Post comment"}</Button></div>
        </form>
      ) : <Notice tone="info">New comments are paused while this Hub has no active plan. Nothing is deleted.</Notice>}
      <ReportDialog comment={reporting} onClose={() => setReporting(null)} onDone={() => { setReporting(null); q.reload(); }} />
    </section>
  );
}

export function CommentsPage() {
  const { hub } = useHub();
  return (
    <div className="lv-cm-stack" data-testid="comments-page">
      <PageHead eyebrow="Comments" title={`Talk with ${hub.name}`} />
      <Card><CommentThread hubId={hub.hub_id} /></Card>
    </div>
  );
}

/* ------------------------------------------------------------------ leaderboard (C-01) */

export function LeaderboardPage() {
  const { hub } = useHub();
  const { api } = useIdentity();
  const q = useLv(() => api.leaderboardGet(hub.hub_id), [api, hub.hub_id]);
  const [busy, setBusy] = useState(false);
  if (q.loading && !q.data) return <LoadingRows rows={3} label="Loading leaderboard" />;
  if (q.error) return <Blocked error={q.error} what="leaderboard" />;
  const d = q.data!;
  async function toggle(on: boolean) {
    setBusy(true);
    const r = await api.leaderboardOpt(hub.hub_id, on);
    setBusy(false);
    if (r.ok) { toast.success(on ? "You’re on the leaderboard" : "You’re off the leaderboard"); q.reload(); } else toast.error(describeError(r.error));
  }
  return (
    <div className="lv-cm-stack" data-testid="leaderboard">
      <PageHead eyebrow="Leaderboard" title="Who takes part most" />
      <Card>
        <ToggleRow
          title="Show me on the leaderboard"
          description={`Off unless you turn it on. It shows your name and how many of this Hub’s ended Campaigns you took part in, anonymous ones included (you: ${d.me.campaigns}). Never your answers, never when you answered.`}
          control={<Switch aria-label="Show me on the leaderboard" checked={d.me.opted_in} disabled={busy} onCheckedChange={toggle} />}
        />
      </Card>
      <Card>
        {d.entries.length === 0 ? (
          <EmptyState icon={<Icon name="star" size={22} />} title="Nobody has joined the leaderboard yet">Members appear here only after they choose to.</EmptyState>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Rank</TableHead><TableHead>Member</TableHead><TableHead className="lv-cm-num">Campaigns</TableHead></TableRow></TableHeader>
            <TableBody>
              {d.entries.map((e, i) => (
                <TableRow key={i} data-me={e.me ? "" : undefined}>
                  <TableCell>{e.rank}</TableCell>
                  <TableCell>{e.display_name}{e.me && <> <Badge variant="accent">You</Badge></>}</TableCell>
                  <TableCell className="lv-cm-num">{e.campaigns}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="ui-help lv-m0">Counts only Campaigns that have ended, so the board never shows when someone answered. Guests never appear.</p>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ Shop and Hub points (C-02) */

function ItemEditor({ hubId, onDone }: { hubId: string; onDone: () => void }) {
  const { api } = useIdentity();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [desc, setDesc] = useState("");
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const r = await api.shopItemSave(hubId, { name: name.trim(), description: desc, price_points: Number(price), stock: stock === "" ? null : Number(stock) });
    if (r.ok) { toast.success("Item added"); setName(""); setPrice(""); setStock(""); setDesc(""); onDone(); } else toast.error(describeError(r.error));
  }
  return (
    <form className="lv-cm-form" onSubmit={add} data-testid="shop-item-form">
      <Field label="Item" htmlFor="item-name"><Input id="item-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Club socks" /></Field>
      <Field label="Price (points)" htmlFor="item-price"><Input id="item-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} /></Field>
      <Field label="Stock (empty = no limit)" htmlFor="item-stock"><Input id="item-stock" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))} /></Field>
      <Field label="Description" htmlFor="item-desc"><Input id="item-desc" value={desc} maxLength={1000} onChange={(e) => setDesc(e.target.value)} /></Field>
      <div><Button type="submit" variant="secondary" disabled={!name.trim() || !price}><Icon name="plus" size={16} />Add item</Button></div>
    </form>
  );
}

function ShopManager({ hubId, data, reload }: { hubId: string; data: NonNullable<ReturnType<typeof useShop>["data"]>; reload: () => void }) {
  const { api } = useIdentity();
  const orders = useLv(() => api.shopOrderList(hubId), [api, hubId, data]);
  const [pts, setPts] = useState<Record<string, string>>({});
  const act = async (p: Promise<{ ok: boolean; error?: LvError }>, done: string, also?: () => void) => {
    const r = await p;
    if (r.ok) { toast.success(done); reload(); also?.(); } else toast.error(describeError(r.error!));
  };
  return (
    <Card data-testid="shop-manager">
      <Eyebrow>Run the Shop</Eyebrow>
      <ToggleRow
        title="Hub points"
        description="Members earn points for taking part in Campaigns you give points to. Points have no cash value and never reveal answers."
        control={<Switch aria-label="Hub points" checked={data.points_enabled} onCheckedChange={(on) => act(api.communityUpdate(hubId, { pointsEnabled: on }), on ? "Points turned on" : "Points turned off")} />}
      />
      <SectionTitle>Items {data.item_limit !== null && <span className="ui-muted lv-small">({data.items.filter((i) => i.active).length} of {data.item_limit} active)</span>}</SectionTitle>
      {data.items.map((i) => (
        <div key={i.item_id} className="lv-page-row">
          <div className="lv-page-row-main"><strong>{i.name}</strong><span>{i.price_points} points · {i.stock === null ? "no stock limit" : `${i.stock} left`}</span></div>
          <Switch aria-label={`${i.name} on sale`} checked={i.active} onCheckedChange={(on) => act(api.shopItemSave(hubId, { item_id: i.item_id, active: on }), on ? "On sale" : "Taken off sale")} />
        </div>
      ))}
      <ItemEditor hubId={hubId} onDone={reload} />
      <SectionTitle>Points per Campaign</SectionTitle>
      <p className="ui-help lv-m0">Points are recorded when someone takes part. Changing a value only affects new participation.</p>
      {(data.campaign_points ?? []).map((c) => (
        <div key={c.campaign_id} className="lv-page-row">
          <div className="lv-page-row-main"><strong>{c.title}</strong><span>{c.status} · {c.points} points</span></div>
          <Input aria-label={`Points for ${c.title}`} className="lv-cm-pts" inputMode="numeric" value={pts[c.campaign_id] ?? String(c.points)} onChange={(e) => setPts((p) => ({ ...p, [c.campaign_id]: e.target.value.replace(/\D/g, "") }))} />
          <Button size="sm" variant="secondary" onClick={() => act(api.campaignPointsSet(c.campaign_id, Number(pts[c.campaign_id] ?? c.points)), "Points saved")}>Save</Button>
        </div>
      ))}
      <SectionTitle>Orders</SectionTitle>
      {orders.data?.orders.length ? orders.data.orders.map((o) => (
        <div key={o.order_id} className="lv-page-row" data-testid="shop-order">
          <div className="lv-page-row-main"><strong>{o.item_name}</strong><span>{o.member_name} · {o.points} points · {fmt(o.created_at)}</span></div>
          <Badge variant={o.status === "fulfilled" ? "ok" : o.status === "cancelled" ? "outline" : "accent"}>{o.status}</Badge>
          {o.status === "placed" && <>
            <Button size="sm" variant="primary" onClick={() => act(api.shopOrderUpdate(o.order_id, "fulfilled"), "Marked fulfilled", orders.reload)}>Fulfil</Button>
            <Button size="sm" variant="quiet" onClick={() => act(api.shopOrderUpdate(o.order_id, "cancelled"), "Order cancelled, points returned", orders.reload)}>Cancel</Button>
          </>}
        </div>
      )) : <p className="ui-muted lv-m0">No orders yet. You hand items over yourself and mark them fulfilled here.</p>}
    </Card>
  );
}

function useShop(hubId: string) {
  const { api } = useIdentity();
  return useLv(() => api.shopGet(hubId), [api, hubId]);
}

export function ShopPage() {
  const { hub } = useHub();
  const { api } = useIdentity();
  const q = useShop(hub.hub_id);
  const [confirmItem, setConfirmItem] = useState<ShopItem | null>(null);
  if (q.loading && !q.data) return <LoadingRows rows={3} label="Loading Shop" />;
  if (q.error) return <Blocked error={q.error} what="Shop" />;
  const d = q.data!;
  async function order() {
    const r = await api.shopOrderPlace(confirmItem!.item_id);
    setConfirmItem(null);
    if (r.ok) { toast.success(`Ordered ${r.order.item_name}. The Hub will hand it over.`); q.reload(); } else toast.error(describeError(r.error));
  }
  return (
    <div className="lv-cm-stack" data-testid="shop">
      <PageHead eyebrow="Shop" title="Spend your Hub points">
        {d.points_enabled && <Metric tone="raised" label="Your points" value={<span data-testid="points-balance">{d.balance}</span>} />}
      </PageHead>
      {!d.points_enabled && <Notice tone="info" title="Points are off">This Hub hasn’t turned Hub points on yet, so nothing can be ordered.</Notice>}
      <p className="ui-help lv-m0">Points come from taking part in this Hub’s Campaigns. They have no cash value. Orders are handed over by the Hub in person.</p>
      <div className="lv-cm-items">
        {d.items.filter((i) => i.active).map((i) => (
          <Card key={i.item_id} size="sm" data-testid="shop-item">
            <strong>{i.name}</strong>
            {i.description && <span className="ui-muted lv-small">{i.description}</span>}
            <span className="lv-cm-price">{i.price_points} points</span>
            <span className="ui-muted lv-small">{i.stock === null ? "Available" : i.stock > 0 ? `${i.stock} left` : "Out of stock"}</span>
            <Button size="sm" variant="primary" disabled={!d.can_order || (i.stock !== null && i.stock <= 0) || d.balance < i.price_points} onClick={() => setConfirmItem(i)}>
              {d.balance < i.price_points ? `Needs ${i.price_points - d.balance} more` : "Order"}
            </Button>
          </Card>
        ))}
        {d.items.filter((i) => i.active).length === 0 && <Card variant="well"><EmptyState title="Nothing in the Shop yet" /></Card>}
      </div>
      {d.my_orders.length > 0 && (
        <Card data-testid="my-orders">
          <SectionTitle>My orders</SectionTitle>
          {d.my_orders.map((o) => (
            <div key={o.order_id} className="lv-page-row">
              <div className="lv-page-row-main"><strong>{o.item_name}</strong><span>{o.points} points · {fmt(o.created_at)}</span></div>
              <Badge variant={o.status === "fulfilled" ? "ok" : o.status === "cancelled" ? "outline" : "accent"}>{o.status === "placed" ? "waiting" : o.status}</Badge>
              {o.status === "placed" && <Button size="sm" variant="quiet" onClick={async () => { const r = await api.shopOrderUpdate(o.order_id, "cancelled"); if (r.ok) { toast.success("Order cancelled, points returned"); q.reload(); } else toast.error(describeError(r.error)); }}>Cancel</Button>}
            </div>
          ))}
        </Card>
      )}
      {d.can_manage && <ShopManager hubId={hub.hub_id} data={d} reload={q.reload} />}
      <Dialog open={Boolean(confirmItem)} onOpenChange={(o) => { if (!o) setConfirmItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Order {confirmItem?.name}?</DialogTitle>
            <DialogDescription>This spends {confirmItem?.price_points} points. You’ll have {d.balance - (confirmItem?.price_points ?? 0)} left. You can cancel while it is waiting.</DialogDescription>
          </DialogHeader>
          <div className="ui-row"><Button variant="primary" onClick={order}>Confirm order</Button><Button variant="quiet" onClick={() => setConfirmItem(null)}>Not now</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ dispatcher for the add-on routes */

export function CommunityPage({ kind }: { kind: "shop" | "leaderboard" | "news" | "post" | "comments" | "page" }) {
  switch (kind) {
    case "shop": return <ShopPage />;
    case "leaderboard": return <LeaderboardPage />;
    case "news": return <NewsPage />;
    case "post": return <PostPage />;
    case "comments": return <CommentsPage />;
    default: return <CustomPage />;
  }
}

/* ------------------------------------------------------------------ Builder: custom page editor */

export function PageEditor({ page, publicHub, onChange }: { page: HubPage; publicHub: boolean; onChange: (p: HubPage) => void }) {
  return (
    <div className="lv-cm-stack" data-testid="page-editor">
      <Field label="Page title" htmlFor={`pt-${page.key}`}><Input id={`pt-${page.key}`} value={page.title} maxLength={80} onChange={(e) => onChange({ ...page, title: e.target.value })} /></Field>
      <Field label="Page content" htmlFor={`pb-${page.key}`} counter={{ value: (page.body ?? "").length, max: 20000 }} help="# heading, - list item, **bold**, [text](https://…). Shown as text: no HTML, no scripts.">
        <Textarea id={`pb-${page.key}`} rows={8} value={page.body ?? ""} onChange={(e) => onChange({ ...page, body: e.target.value })} />
      </Field>
      <Field label="Who can see this page">
      <Segmented label="Who can see this page" value={page.visibility ?? "members"} onValueChange={(v) => onChange({ ...page, visibility: v })}
        options={[{ value: "members", label: "Members" }, { value: "public", label: "Anyone" }]} />
      </Field>
      {page.visibility === "public" && !publicHub && <p className="ui-help lv-m0">This Hub is private, so the page stays members-only until the Hub is public.</p>}
      {page.body?.trim() && <Card variant="well" size="sm"><Eyebrow>Preview</Eyebrow><Markdown source={page.body} /></Card>}
    </div>
  );
}

/* ------------------------------------------------------------------ Discover directory (public) */

export function DiscoverDirectory() {
  const { api } = useIdentity();
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [cat, setCat] = useState("all");
  const q = useLv(() => api.discoverList(term, cat === "all" ? null : cat), [api, term, cat]);
  useEffect(() => { const t = setTimeout(() => setTerm(query.trim()), 250); return () => clearTimeout(t); }, [query]);
  const cats = q.data?.categories ?? [];
  const label = (k: string | null) => cats.find((c) => c.key === k)?.label;
  return (
    <div className="lv-cm-stack" data-testid="discover">
      <div className="lv-cm-filters">
        <Field label="Search Hubs" htmlFor="discover-q"><Input id="discover-q" type="search" value={query} maxLength={80} onChange={(e) => setQuery(e.target.value)} placeholder="Running, books, gardening…" /></Field>
        <Field label="Category" htmlFor="discover-cat">
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger id="discover-cat" aria-label="Category"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {cats.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
      {q.loading && !q.data ? <LoadingRows rows={3} label="Loading Hubs" />
        : q.error ? <Notice tone="error">{describeError(q.error)}</Notice>
        : q.data!.hubs.length === 0 ? (
          <Card variant="well">
            <EmptyState icon={<Icon name="star" size={22} />} title={term || cat !== "all" ? "No Hubs match" : "No Hubs are listed yet"} action={<LinkButton to="/pricing" variant="secondary">See what Discover needs</LinkButton>}>
              Hubs appear here only after they reach 700 genuine active members on the Team plan and are approved. Quick Surveys are never listed, and nothing is seeded to fill the page.
            </EmptyState>
          </Card>
        ) : (
          <ul className="lv-cm-discover" aria-label="Listed Hubs">
            {q.data!.hubs.map((h: DiscoverHub) => (
              <li key={h.slug}>
                <Link to={`/${h.slug}`} className="lv-cm-hubcard" data-testid="discover-hub">
                  <span className="lv-hubmark-wrap" style={accentHex(h.accent) ? { background: accentHex(h.accent)!, color: onAccent(accentHex(h.accent)!) } : undefined}><HubMark name={h.name} size={48} /></span>
                  <span className="lv-cm-hubtext">
                    <strong>{h.name}</strong>
                    <span className="ui-muted lv-small">lunchvoice.com/{h.slug}{label(h.category) ? ` · ${label(h.category)}` : ""}</span>
                    {h.about && <span className="lv-small">{h.about}</span>}
                    <span className="ui-muted lv-small">{h.members_rounded.toLocaleString()}+ active members · {h.membership_mode === "open" ? "Open to join" : h.membership_mode === "approval" ? "Ask to join" : "Invite only"}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
