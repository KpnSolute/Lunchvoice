// Per-tenant visual branding, keyed by lowercase org slug. Orgs without an
// entry fall back to the default Lunch Voice look (no bg photo, no logo swap).
export type TenantBrand = {
  logo: string;
  favicon: string;
  loginBg?: string;
};

const BRANDS: Record<string, TenantBrand> = {
  lioncafe: {
    logo: "/tenants/LionCafe/logo-shield.svg",
    favicon: "/tenants/LionCafe/favicon.svg",
    loginBg: "/tenants/LionCafe/login-bg.jpg",
  },
};

export function tenantBrand(slug: string): TenantBrand | undefined {
  return BRANDS[slug.toLowerCase()];
}
