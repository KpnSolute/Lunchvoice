import { Link } from "react-router-dom";

export function NotFoundOrg({ slug }: { slug?: string }) {
  return (
    <div className="wrap center" style={{ paddingTop: 80, maxWidth: 440 }}>
      <div className="card center">
        <p className="eyebrow tag" style={{ display: "inline-block" }}>Lunch Voice</p>
        <h2 style={{ marginTop: 12 }}>Organization not found</h2>
        <p className="hint" style={{ margin: "8px 0 16px" }}>
          {slug
            ? <>No organization matching <b>"{slug}"</b> exists on Lunch Voice.</>
            : <>No organization was specified in the URL.</>
          }
        </p>
        <Link to="/" className="btn btn-primary btn-block">Back to Lunch Voice</Link>
      </div>
    </div>
  );
}
