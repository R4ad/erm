import { Link } from "react-router-dom";

import { useTitle } from "../components/bits";
import { useSession } from "../components/Shell";

export function NotFound() {
  useTitle("صفحه پیدا نشد");
  const session = useSession();
  return (
    <div className="page">
      <div className="sheet empty">
        <h1>این صفحه در رابط تازه نیست</h1>
        <p className="hint">
          نشانی را بررسی کنید. صفحه‌هایی که هنوز به رابط تازه نیامده‌اند از منوی کنار صفحه یا صفحه‌های فعلی باز می‌شوند.
        </p>
        <div className="actions">
          <Link className="button" to="/">
            کارهای من
          </Link>
          <a className="button" href={session.classic_home}>
            صفحه‌های فعلی سامانه
          </a>
        </div>
      </div>
    </div>
  );
}
