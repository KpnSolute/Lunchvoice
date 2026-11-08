// Track C: typed client for the community and Discover lv_api functions (000020). Shapes follow
// docs/backend/API_CONTRACT.md, section "Community and Discover (000020, track C)". Spread into createLvApi.
import type { LvResult } from "./lvApi";

type Call = <T>(fn: string, args?: Record<string, unknown>) => Promise<LvResult<T>>;

export type AddonKind = "news" | "comments" | "leaderboard" | "shop";
export type AddonState = Record<AddonKind, { enabled: boolean; allowed: boolean }>;
export type PostVisibility = "members" | "public";

export interface DiscoverCategory { key: string; label: string }

export interface CommunityInfo {
  settings: { points_enabled: boolean; discover_category: string | null };
  categories: DiscoverCategory[];
  addons: AddonState;
  discover: { status: "none" | "submitted" | "approved" | "rejected" };
  can: { post: boolean; moderate: boolean; shop: boolean; settings: boolean };
  me: { leaderboard_opt_in: boolean; points: number | null };
}

export interface NewsPost {
  post_id: string;
  title: string;
  body: string;
  status: "draft" | "published";
  visibility: PostVisibility;
  pinned: boolean;
  published_at: string | null;
  updated_at: string;
  author_name: string | null;
  /** Members only; null for visitors. */
  comment_count: number | null;
}

export interface CommentRow {
  comment_id: string;
  body: string;
  created_at: string;
  author_name: string;
  mine: boolean;
  hidden: boolean;
  reported_by_me: boolean;
  /** Moderators only. */
  report_count?: number;
}

export interface LeaderboardEntry { rank: number; display_name: string; campaigns: number; me: boolean }

export interface ShopItem { item_id: string; name: string; description: string; price_points: number; stock: number | null; active: boolean }
export type OrderStatus = "placed" | "fulfilled" | "cancelled";
export interface ShopOrder { order_id: string; item_id: string; item_name: string; points: number; status: OrderStatus; created_at: string; updated_at: string; member_name?: string }
export interface CampaignPoints { campaign_id: string; title: string; status: string; points: number }

export interface ShopData {
  points_enabled: boolean;
  can_order: boolean;
  balance: number;
  can_manage: boolean;
  item_limit: number | null;
  items: ShopItem[];
  my_orders: ShopOrder[];
  campaign_points: CampaignPoints[] | null;
}

export interface DiscoverHub {
  slug: string;
  name: string;
  about: string | null;
  accent: string | null;
  category: string | null;
  membership_mode: string;
  /** Genuine active members, rounded down to the nearest 100. */
  members_rounded: number;
}

export function communityApi(call: Call) {
  return {
    communityGet: (hub: string) => call<CommunityInfo>("lv_community_get", { p_hub: hub }),
    communityUpdate: (hub: string, patch: { pointsEnabled?: boolean; discoverCategory?: string }) =>
      call<CommunityInfo>("lv_community_update", { p_hub: hub, p_points_enabled: patch.pointsEnabled ?? null, p_discover_category: patch.discoverCategory ?? null }),

    newsList: (hub: string, includeDrafts = false) => call<{ posts: NewsPost[]; can_post: boolean }>("lv_news_list", { p_hub: hub, p_include_drafts: includeDrafts }),
    newsGet: (post: string) => call<{ post: NewsPost; hub_id: string; can_post: boolean; comments_enabled: boolean }>("lv_news_get", { p_post: post }),
    newsSave: (hub: string, title: string, body: string, visibility: PostVisibility, post?: string | null) =>
      call<{ post: NewsPost }>("lv_news_save", { p_hub: hub, p_title: title, p_body: body, p_visibility: visibility, p_post: post ?? null }),
    newsPublish: (post: string, publish = true) => call<{ post: NewsPost }>("lv_news_publish", { p_post: post, p_publish: publish }),
    newsPin: (post: string, pinned = true) => call<{ post: NewsPost }>("lv_news_pin", { p_post: post, p_pinned: pinned }),
    newsDelete: (post: string) => call<object>("lv_news_delete", { p_post: post }),

    commentList: (hub: string, post?: string | null) =>
      call<{ comments: CommentRow[]; can_moderate: boolean; can_comment: boolean; max_length: number }>("lv_comment_list", { p_hub: hub, p_post: post ?? null }),
    commentAdd: (hub: string, body: string, post?: string | null) => call<{ comment_id: string }>("lv_comment_add", { p_hub: hub, p_body: body, p_post: post ?? null }),
    commentDelete: (comment: string) => call<object>("lv_comment_delete", { p_comment: comment }),
    commentHide: (comment: string, hidden = true) => call<{ hidden: boolean }>("lv_comment_hide", { p_comment: comment, p_hidden: hidden }),
    commentReport: (comment: string, reason: string) => call<{ already_reported: boolean }>("lv_comment_report", { p_comment: comment, p_reason: reason }),

    leaderboardGet: (hub: string) => call<{ me: { opted_in: boolean; campaigns: number }; entries: LeaderboardEntry[] }>("lv_leaderboard_get", { p_hub: hub }),
    leaderboardOpt: (hub: string, optIn: boolean) => call<{ opted_in: boolean }>("lv_leaderboard_opt", { p_hub: hub, p_opt_in: optIn }),

    shopGet: (hub: string) => call<ShopData>("lv_shop_get", { p_hub: hub }),
    // p_stock: a number limits stock, null keeps it (no limit for a new item), -1 removes the limit.
    shopItemSave: (hub: string, item: { item_id?: string; name?: string; description?: string; price_points?: number; stock?: number | null; active?: boolean }) =>
      call<{ item: ShopItem }>("lv_shop_item_save", {
        p_hub: hub, p_item: item.item_id ?? null, p_name: item.name ?? null, p_description: item.description ?? null,
        p_price_points: item.price_points ?? null, p_stock: item.stock ?? null, p_active: item.active ?? null,
      }),
    shopOrderPlace: (item: string) => call<{ order: ShopOrder; balance: number }>("lv_shop_order_place", { p_item: item }),
    shopOrderList: (hub: string, status?: OrderStatus | null) => call<{ orders: ShopOrder[] }>("lv_shop_order_list", { p_hub: hub, p_status: status ?? null }),
    shopOrderUpdate: (order: string, status: "fulfilled" | "cancelled") => call<{ order: ShopOrder }>("lv_shop_order_update", { p_order: order, p_status: status }),
    campaignPointsSet: (campaign: string, points: number) => call<{ campaign_id: string; points: number }>("lv_campaign_points_set", { p_campaign: campaign, p_points: points }),

    discoverList: (query?: string | null, category?: string | null, limit = 24, offset = 0) =>
      call<{ hubs: DiscoverHub[]; categories: DiscoverCategory[] }>("lv_discover_list", { p_query: query || null, p_category: category || null, p_limit: limit, p_offset: offset }),
  };
}
