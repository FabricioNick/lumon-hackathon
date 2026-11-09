/* Praise Kier */
import { Refiners, Detail, Edit, Badge, Incidents, NewIncident } from "./pages";
import type { RouteObject } from "react-router-dom";
import { Permissions } from "./runtime";
/** Add these routes to CP1's router; keep Cp45Provider and ContingencyModal above route navigation. */
export function createCp45Routes(): RouteObject[] {
  return [
    {
      path: "/refiners",
      element: (
        <Permissions permissions={["refiners:read"]}>
          <Refiners />
        </Permissions>
      ),
    },
    {
      path: "/refiners/:id",
      element: (
        <Permissions permissions={["refiners:read"]}>
          <Detail />
        </Permissions>
      ),
    },
    {
      path: "/refiners/:id/edit",
      element: (
        <Permissions permissions={["refiners:read", "refiners:write"]}>
          <Edit />
        </Permissions>
      ),
    },
    {
      path: "/refiners/:id/badge",
      element: (
        <Permissions
          permissions={["refiners:read", "refiners:write", "media:upload"]}
        >
          <Badge />
        </Permissions>
      ),
    },
    {
      path: "/incidents",
      element: (
        <Permissions permissions={["incidents:read"]}>
          <Incidents />
        </Permissions>
      ),
    },
    {
      path: "/incidents/new",
      element: (
        <Permissions permissions={["incidents:create", "media:upload"]}>
          <NewIncident />
        </Permissions>
      ),
    },
  ];
}
