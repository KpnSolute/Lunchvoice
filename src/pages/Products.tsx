import { Link, useParams } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { LinkButton } from "../components/ui";
import { Card } from "@/components/shadcn/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import { ResultBars } from "@/components/shadcn/blocks/results";
import { HubCard } from "../components/HubCard";
import { TemplateQuestions } from "../components/TemplateQuestions";
import { PRODUCTS, productBySlug, productPlanRows, type ProductCell, type ProductPage as Product } from "../config/products";
import { PLANS } from "../config/pricing";
import { templateById } from "../config/surveyTemplates";
import { useBilling } from "../lib/useBilling";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { Head, NotFoundPage } from "./Marketing";

// /products and /products/:slug. One layout for all six products (founder direction, PRODUCT_DIRECTION section 8):
// headline, who it is for, what you get, by plan, how it fits, price. Content is src/config/products.json; the
// "by plan" table reads the server's entitlement map (lv_plan_limits), the same source /pricing uses.

const PLAN_COLUMNS = ["Free", "Starter Hub", "Team Hub"] as const;

function Cell({ v }: { v: ProductCell }) {
  if (v === true) return <span className="lv-cap-yes" aria-label="Included"><Icon name="check" size={18} /></span>;
  if (v === false) return <span className="lv-cap-no" aria-label="Not included">—</span>;
  return <>{v}</>;
}

/** What the product looks like, drawn with the product's own components. Sample content is always labelled. */
function Demo({ p }: { p: Product }) {
  if (p.demo === "hub-card") {
    return (
      <figure className="lv-pd-demo">
        <HubCard
          testId="product-demo-hub"
          hub={{ name: "Northside Runners", slug: "northside-runners", member_count: 48, membership_mode: "approval", about: "Routes, race votes and what the committee decided." }}
        />
        <figcaption>Example Hub card. Yours shows your own name, colour and members.</figcaption>
      </figure>
    );
  }
  if (p.demo === "questions") {
    const tpl = templateById("event-feedback");
    if (!tpl) return null;
    return (
      <figure className="lv-pd-demo">
        <Card><strong>{tpl.name}</strong><TemplateQuestions questions={tpl.questions.slice(0, 3)} /></Card>
        <figcaption>The first questions of a free template. Every one can be edited.</figcaption>
      </figure>
    );
  }
  if (p.demo === "lifecycle") {
    return (
      <figure className="lv-pd-demo">
        <Card>
          <strong>A Campaign's life</strong>
          <ol className="lv-pd-steps">
            <li><b>Draft</b><span>Write and reorder questions. Nobody can answer yet.</span></li>
            <li><b>Scheduled</b><span>It opens by itself at the time you set.</span></li>
            <li><b>Open</b><span>Members answer. The questions are locked.</span></li>
            <li><b>Closed</b><span>No new answers. Results stay.</span></li>
          </ol>
        </Card>
      </figure>
    );
  }
  if (p.demo === "commands") {
    return (
      <figure className="lv-pd-demo">
        <Card>
          <strong>Commands</strong>
          <dl className="lv-pd-cmds">
            <div><dt>/lunchvoice link</dt><dd>Link your Discord account to your LunchVoice account.</dd></div>
            <div><dt>/lunchvoice connect</dt><dd>Server admins: connect this server to a Hub.</dd></div>
            <div><dt>/lunchvoice post</dt><dd>Post a published Campaign by its six-character code.</dd></div>
            <div><dt>/lunchvoice setup</dt><dd>Server admins: give a role to members of your Hub.</dd></div>
            <div><dt>/lunchvoice verify</dt><dd>Check which roles you should have.</dd></div>
            <div><dt>/lunchvoice unlink</dt><dd>Remove the link whenever you like.</dd></div>
          </dl>
        </Card>
      </figure>
    );
  }
  if (p.demo === "curl") {
    return (
      <figure className="lv-pd-demo">
        <pre className="lv-pre" aria-label="Example request">{`curl -s -X POST …/api/v1/campaigns \\
  -H "Authorization: Bearer $LUNCHVOICE_API_KEY" \\
  -H "content-type: application/json" \\
  -d '{"title":"Saturday long run",
       "mode":"poll","anonymity":"identified"}'`}</pre>
        <figcaption>Creating a draft poll. The <Link className="lv-inline-link" to="/developers">Developers page</Link> has every endpoint.</figcaption>
      </figure>
    );
  }
  return (
    <figure className="lv-pd-demo">
      <Card>
        <strong>Which day works for the meeting?</strong>
        <ResultBars
          caption="Example results with a withheld group"
          cells={[
            { key: "tue", label: "Tuesday", n: 14, suppressed: false },
            { key: "thu", label: "Thursday", n: 9, suppressed: false },
            { key: "other", n: null, suppressed: true },
          ]}
        />
      </Card>
      <figcaption>Example results. The smallest answers are merged and withheld, with no number shown.</figcaption>
    </figure>
  );
}

function PlanTable({ p }: { p: Product }) {
  const { api } = useIdentity();
  const limits = useLv(() => api.planLimits(), [api]);
  const rows = productPlanRows(p, limits.data?.families);
  if (rows.length === 0) return null;
  return (
    <section className="lv-pd-section" aria-labelledby="pd-plans">
      <h2 id="pd-plans">By plan</h2>
      <div className="lv-pd-table" data-testid="product-plans">
        <Table>
          <TableHeader>
            <TableRow><TableHead scope="col">What you get</TableHead>{PLAN_COLUMNS.map((c) => <TableHead key={c} scope="col">{c}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.label}>
                <TableHead scope="row">{r.label}</TableHead>
                {r.cells.map((v, i) => <TableCell key={PLAN_COLUMNS[i]}><Cell v={v} /></TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="ui-help lv-m0">A Campaign pass gives Starter features (Campaign Starter) or Team features (Campaign Plus) for the weeks you choose. <Link className="lv-inline-link" to="/pricing">Compare every plan</Link>.</p>
    </section>
  );
}

function Price({ p }: { p: Product }) {
  const { ctas } = useBilling();
  const plans = p.plans.map((id) => PLANS.find((x) => x.id === id)).filter((x): x is (typeof PLANS)[number] => Boolean(x));
  const action = p.cta === "survey" ? ctas.primary : p.cta === "developers" ? { to: "/developers", label: "Read the API reference" } : ctas.hub;
  return (
    <section className="lv-pd-section" aria-labelledby="pd-price">
      <h2 id="pd-price">Price</h2>
      <ul className="lv-pd-prices" data-testid="product-prices">
        {plans.map((x) => (
          <li key={x.id}><strong>{x.name}</strong><span><b>{x.priceLabel}</b> {x.cadence}</span></li>
        ))}
      </ul>
      <p className="ui-help lv-m0">Answering is always free, on every plan.</p>
      <div className="ui-row">
        <LinkButton to={action.to} variant="primary" size="lg" icon="arrow" data-testid="product-cta">{action.label}</LinkButton>
        <LinkButton to="/pricing" variant="secondary" size="lg">See pricing</LinkButton>
      </div>
    </section>
  );
}

export function ProductPage() {
  const { slug } = useParams();
  const p = productBySlug(slug);
  if (!p) return <NotFoundPage />;
  const related = p.related.map(productBySlug).filter((r): r is Product => r !== null);
  return (
    <div className="lv-mk lv-pd" data-testid="product-page">
      <div className="lv-pd-top">
        <div className="lv-pd-intro">
          <Head eyebrow={p.name} title={p.h1} sub={p.lede} />
          <section aria-labelledby="pd-who" className="lv-pd-who">
            <h2 id="pd-who">Who it is for</h2>
            <ul>{p.audience.map((a) => <li key={a}>{a}</li>)}</ul>
          </section>
        </div>
        <Demo p={p} />
      </div>

      <section className="lv-pd-section" aria-labelledby="pd-what">
        <h2 id="pd-what">What you get</h2>
        <dl className="lv-pd-points" data-testid="product-points">
          {p.points.map((x) => <div key={x.title}><dt>{x.title}</dt><dd>{x.body}</dd></div>)}
        </dl>
      </section>

      <PlanTable p={p} />

      <section className="lv-pd-section" aria-labelledby="pd-fits">
        <h2 id="pd-fits">How it fits</h2>
        <p className="lv-pd-fits">{p.fits}</p>
        <ul className="lv-pd-related" data-testid="product-related">
          {related.map((r) => (
            <li key={r.slug}><Link to={`/products/${r.slug}`}><Icon name={r.icon as IconName} size={18} /><span><strong>{r.name}</strong>{r.line}</span></Link></li>
          ))}
        </ul>
      </section>

      <Price p={p} />
    </div>
  );
}

export function Products() {
  return (
    <div className="lv-mk" data-testid="products-index">
      <Head eyebrow="Products" title="Where a community decides." sub="Ask with free feedback tools, give your community a Hub, run Campaigns for your members, and bring it all to the places they already talk." />
      <ul className="lv-pd-index" data-testid="product-list">
        {PRODUCTS.map((p) => (
          <li key={p.slug}>
            <Link to={`/products/${p.slug}`}>
              <span className="lv-mk-icon"><Icon name={p.icon as IconName} size={22} /></span>
              <span className="lv-pd-index-text"><strong>{p.name}</strong><span>{p.line}</span></span>
              <Icon name="arrow" size={18} />
            </Link>
          </li>
        ))}
      </ul>
      <div className="ui-row"><LinkButton to="/surveys/new" variant="primary" size="lg" icon="arrow">Start a free survey</LinkButton><LinkButton to="/pricing" variant="secondary" size="lg">See pricing</LinkButton></div>
    </div>
  );
}
