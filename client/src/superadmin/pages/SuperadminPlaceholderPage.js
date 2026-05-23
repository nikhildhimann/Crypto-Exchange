import { useLocation } from "react-router";
import { SuperadminEmptyState } from "../components/SuperadminEmptyState";
import { SuperadminPage } from "../components/SuperadminPage";
import { SuperadminPageHeader } from "../components/SuperadminPageHeader";
import { SuperadminSectionCard } from "../components/SuperadminSectionCard";
import { resolveSuperadminRoute } from "../config/routes";

export function SuperadminPlaceholderPage() {
  const location = useLocation();
  const route = resolveSuperadminRoute(location.pathname);

  return (
    <SuperadminPage
      header={(
        <SuperadminPageHeader
          eyebrow="Unavailable"
          title={route?.title || "Superadmin Module"}
          description={route?.description || "This section is not available yet."}
        />
      )}
    >
      <SuperadminSectionCard title="Unavailable" description="This module is not available yet.">
        <SuperadminEmptyState
          title={`${route?.title || "This module"} is not available`}
          description="No page content is configured for this section yet."
        />
      </SuperadminSectionCard>
    </SuperadminPage>
  );
}
