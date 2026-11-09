/* Praise Kier */
import { Link } from "react-router-dom";
import { Permission } from "../../cp45/runtime";
import { IncidentForm } from "../components/IncidentForm";
export default function NewIncidentPage() {
  return (
    <Permission name="incidents:create">
      <Permission name="media:upload">
        <Link to="/incidents">← Incidencias</Link>
        <h1 className="my-6 text-3xl font-semibold">Reportar incidencia</h1>
        <IncidentForm />
      </Permission>
    </Permission>
  );
}
