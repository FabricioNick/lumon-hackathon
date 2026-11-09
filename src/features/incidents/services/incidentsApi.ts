import type { Cp45Runtime } from '../../cp45/runtime'
import { jsonResponse } from '../../cp45/http'
import type { Incident, IncidentCreate, IncidentPage } from '../../cp45/contracts'
export function incidentsApi(request: Cp45Runtime['request']) {
  return {
    list: async (page:number, size:number, signal?:AbortSignal) => jsonResponse<IncidentPage>(await request(`/incidents?${new URLSearchParams({page:String(page),size:String(size)})}`,{signal})),
    create: async (incident: IncidentCreate) => jsonResponse<Incident>(await request('/incidents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(incident)})),
  }
}
