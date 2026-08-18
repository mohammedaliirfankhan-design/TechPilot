export type DeviceStatus = "Healthy" | "Warning" | "Offline";

export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

export type Device = {
  id: string;
  name: string;
  user: string;
  os: string;
  status: DeviceStatus;
  risk: RiskLevel;
  lastSeen: string;

  // Resource telemetry
  cpuUsage: number;
  ramUsage: number;
  diskUsage: number;

  // CPU details
  cpuCores: number;
  cpuFrequency: string;
  cpuModel: string;

  // RAM details
  ramTotal: string;
  ramUsed: string;
  ramAvailable: string;

  // Disk details
  diskTotal: string;
  diskUsed: string;
  diskAvailable: string;

  // Device identity
  hostname: string;
  machineId: string;
  ipAddress: string;
  macAddress: string;
  architecture: string;
  osVersion: string;

  // TechPilot Agent
  agentVersion: string;
  agentStatus: string;
  lastHeartbeat: string;

  // System status
  uptime: string;
  bootTime: string;
  networkStatus: "Connected" | "Disconnected";

  // Network information
  networkInterface: string;
  downloadSpeed: string;
  uploadSpeed: string;

  // Security & risk
  securityStatus: "Secure" | "At Risk" | "Compromised";
  firewallStatus: "Enabled" | "Disabled";
  antivirusStatus: "Active" | "Inactive";
  pendingUpdates: number;
};

export type ActivityType =
  | "success"
  | "warning"
  | "info"
  | "danger";

export type Activity = {
  title: string;
  device: string;
  time: string;
  type: ActivityType;
};

export type AuditEvent = {
  time: string;
  event: string;
  device: string;
  actor: string;
  risk: RiskLevel;
};

export type Incident = {
  id: string;
  title: string;
  device: string;
  risk: RiskLevel;
  status: string;
};

export const devices: Device[] = [
  {
    id: "TP-1028",
    name: "ENG-LAP-1028",
    user: "Aarav Mehta",
    os: "Windows 11",
    status: "Healthy",
    risk: "Low",
    lastSeen: "2 min ago",

    // Resource telemetry
    cpuUsage: 37,
    ramUsage: 62,
    diskUsage: 71,

    // CPU details
    cpuCores: 8,
    cpuFrequency: "3.2 GHz",
    cpuModel: "Intel Core i5-11300H",

    // RAM details
    ramTotal: "16 GB",
    ramUsed: "9.9 GB",
    ramAvailable: "6.1 GB",

    // Disk details
    diskTotal: "512 GB",
    diskUsed: "364 GB",
    diskAvailable: "148 GB",

    // Device identity
    hostname: "ENG-LAP-1028",
    machineId: "TP-1028",
    ipAddress: "192.168.1.28",
    macAddress: "00:1A:2B:3C:4D:28",
    architecture: "64-bit",
    osVersion: "Windows 11 23H2",

    // TechPilot Agent
    agentVersion: "1.0.0",
    agentStatus: "Running",
    lastHeartbeat: "30 sec ago",

    // System status
    uptime: "3 days 14 hours",
    bootTime: "Aug 10, 2026 08:42 AM",
    networkStatus: "Connected",

    // Network information
    networkInterface: "Wi-Fi",
    downloadSpeed: "86.4 Mbps",
    uploadSpeed: "24.7 Mbps",

    // Security & risk
    securityStatus: "Secure",
    firewallStatus: "Enabled",
    antivirusStatus: "Active",
    pendingUpdates: 2,
  },

  {
    id: "TP-1042",
    name: "FIN-LAP-1042",
    user: "Sara Khan",
    os: "Windows 11",
    status: "Warning",
    risk: "Medium",
    lastSeen: "4 min ago",

    // Resource telemetry
    cpuUsage: 78,
    ramUsage: 81,
    diskUsage: 86,

    // CPU details
    cpuCores: 8,
    cpuFrequency: "3.2 GHz",
    cpuModel: "Intel Core i5-11300H",

    // RAM details
    ramTotal: "16 GB",
    ramUsed: "13.0 GB",
    ramAvailable: "3.0 GB",

    // Disk details
    diskTotal: "512 GB",
    diskUsed: "440 GB",
    diskAvailable: "72 GB",

    // Device identity
    hostname: "FIN-LAP-1042",
    machineId: "TP-1042",
    ipAddress: "192.168.1.42",
    macAddress: "00:1A:2B:3C:4D:42",
    architecture: "64-bit",
    osVersion: "Windows 11 23H2",

    // TechPilot Agent
    agentVersion: "1.0.0",
    agentStatus: "Running",
    lastHeartbeat: "30 sec ago",

    // System status
    uptime: "1 day 8 hours",
    bootTime: "Aug 12, 2026 03:18 AM",
    networkStatus: "Connected",

    // Network information
    networkInterface: "Ethernet",
    downloadSpeed: "142.8 Mbps",
    uploadSpeed: "38.5 Mbps",

    // Security & risk
    securityStatus: "At Risk",
    firewallStatus: "Enabled",
    antivirusStatus: "Active",
    pendingUpdates: 7,
  },

  {
    id: "TP-1087",
    name: "MKT-DESK-1087",
    user: "Daniel Ross",
    os: "Windows 10",
    status: "Healthy",
    risk: "Low",
    lastSeen: "8 min ago",

    // Resource telemetry
    cpuUsage: 29,
    ramUsage: 54,
    diskUsage: 63,

    // CPU details
    cpuCores: 8,
    cpuFrequency: "3.2 GHz",
    cpuModel: "Intel Core i5-11300H",

    // RAM details
    ramTotal: "16 GB",
    ramUsed: "8.6 GB",
    ramAvailable: "7.4 GB",

    // Disk details
    diskTotal: "512 GB",
    diskUsed: "323 GB",
    diskAvailable: "189 GB",

    // Device identity
    hostname: "MKT-DESK-1087",
    machineId: "TP-1087",
    ipAddress: "192.168.1.87",
    macAddress: "00:1A:2B:3C:4D:87",
    architecture: "64-bit",
    osVersion: "Windows 10 22H2",

    // TechPilot Agent
    agentVersion: "1.0.0",
    agentStatus: "Running",
    lastHeartbeat: "30 sec ago",

    // System status
    uptime: "5 days 2 hours",
    bootTime: "Aug 8, 2026 09:24 AM",
    networkStatus: "Connected",

    // Network information
    networkInterface: "Wi-Fi",
    downloadSpeed: "94.2 Mbps",
    uploadSpeed: "31.6 Mbps",

    // Security & risk
    securityStatus: "Secure",
    firewallStatus: "Enabled",
    antivirusStatus: "Active",
    pendingUpdates: 1,
  },

  {
    id: "TP-1104",
    name: "OPS-LAP-1104",
    user: "Maya Patel",
    os: "Windows 11",
    status: "Offline",
    risk: "High",
    lastSeen: "38 min ago",

    // Resource telemetry
    cpuUsage: 92,
    ramUsage: 88,
    diskUsage: 94,

    // CPU details
    cpuCores: 8,
    cpuFrequency: "3.2 GHz",
    cpuModel: "Intel Core i5-11300H",

    // RAM details
    ramTotal: "16 GB",
    ramUsed: "14.1 GB",
    ramAvailable: "1.9 GB",

    // Disk details
    diskTotal: "512 GB",
    diskUsed: "481 GB",
    diskAvailable: "31 GB",

    // Device identity
    hostname: "OPS-LAP-1104",
    machineId: "TP-1104",
    ipAddress: "192.168.1.104",
    macAddress: "00:1A:2B:3C:4D:04",
    architecture: "64-bit",
    osVersion: "Windows 11 23H2",

    // TechPilot Agent
    agentVersion: "1.0.0",
    agentStatus: "Offline",
    lastHeartbeat: "38 min ago",

    // System status
    uptime: "0 days 0 hours",
    bootTime: "Aug 13, 2026 10:02 AM",
    networkStatus: "Disconnected",

    // Network information
    networkInterface: "Wi-Fi",
    downloadSpeed: "0 Mbps",
    uploadSpeed: "0 Mbps",

    // Security & risk
    securityStatus: "Compromised",
    firewallStatus: "Disabled",
    antivirusStatus: "Inactive",
    pendingUpdates: 12,
  },

  {
    id: "TP-1139",
    name: "HR-LAP-1139",
    user: "Noah Wilson",
    os: "Windows 11",
    status: "Healthy",
    risk: "Low",
    lastSeen: "11 min ago",

    // Resource telemetry
    cpuUsage: 34,
    ramUsage: 58,
    diskUsage: 67,

    // CPU details
    cpuCores: 8,
    cpuFrequency: "3.2 GHz",
    cpuModel: "Intel Core i5-11300H",

    // RAM details
    ramTotal: "16 GB",
    ramUsed: "9.3 GB",
    ramAvailable: "6.7 GB",

    // Disk details
    diskTotal: "512 GB",
    diskUsed: "343 GB",
    diskAvailable: "169 GB",

    // Device identity
    hostname: "HR-LAP-1139",
    machineId: "TP-1139",
    ipAddress: "192.168.1.139",
    macAddress: "00:1A:2B:3C:4D:39",
    architecture: "64-bit",
    osVersion: "Windows 11 23H2",

    // TechPilot Agent
    agentVersion: "1.0.0",
    agentStatus: "Running",
    lastHeartbeat: "30 sec ago",

    // System status
    uptime: "2 days 19 hours",
    bootTime: "Aug 10, 2026 04:11 PM",
    networkStatus: "Connected",

    // Network information
    networkInterface: "Wi-Fi",
    downloadSpeed: "118.6 Mbps",
    uploadSpeed: "42.3 Mbps",

    // Security & risk
    securityStatus: "Secure",
    firewallStatus: "Enabled",
    antivirusStatus: "Active",
    pendingUpdates: 3,
  },

  {
    id: "TP-1175",
    name: "SALES-LAP-1175",
    user: "Emma Chen",
    os: "Windows 11",
    status: "Warning",
    risk: "Medium",
    lastSeen: "17 min ago",

    // Resource telemetry
    cpuUsage: 71,
    ramUsage: 76,
    diskUsage: 82,

    // CPU details
    cpuCores: 8,
    cpuFrequency: "3.2 GHz",
    cpuModel: "Intel Core i5-11300H",

    // RAM details
    ramTotal: "16 GB",
    ramUsed: "12.2 GB",
    ramAvailable: "3.8 GB",

    // Disk details
    diskTotal: "512 GB",
    diskUsed: "420 GB",
    diskAvailable: "92 GB",

    // Device identity
    hostname: "SALES-LAP-1175",
    machineId: "TP-1175",
    ipAddress: "192.168.1.175",
    macAddress: "00:1A:2B:3C:4D:75",
    architecture: "64-bit",
    osVersion: "Windows 11 23H2",

    // TechPilot Agent
    agentVersion: "1.0.0",
    agentStatus: "Running",
    lastHeartbeat: "30 sec ago",

    // System status
    uptime: "4 days 6 hours",
    bootTime: "Aug 9, 2026 05:37 AM",
    networkStatus: "Connected",

    // Network information
    networkInterface: "Ethernet",
    downloadSpeed: "156.2 Mbps",
    uploadSpeed: "45.8 Mbps",

    // Security & risk
    securityStatus: "At Risk",
    firewallStatus: "Enabled",
    antivirusStatus: "Active",
    pendingUpdates: 6,
  },
];

export const activities: Activity[] = [
  {
    title: "Diagnostic completed",
    device: "ENG-LAP-1028",
    time: "2 min ago",
    type: "success",
  },

  {
    title: "Remediation approved",
    device: "FIN-LAP-1042",
    time: "11 min ago",
    type: "warning",
  },

  {
    title: "Device registered",
    device: "HR-LAP-1139",
    time: "28 min ago",
    type: "info",
  },

  {
    title: "Policy blocked action",
    device: "OPS-LAP-1104",
    time: "41 min ago",
    type: "danger",
  },
];

export const auditEvents: AuditEvent[] = [
  {
    time: "10:42 AM",
    event: "Remediation approved",
    device: "FIN-LAP-1042",
    actor: "Aarav Mehta",
    risk: "Medium",
  },

  {
    time: "10:31 AM",
    event: "Diagnostic run",
    device: "ENG-LAP-1028",
    actor: "System",
    risk: "Low",
  },

  {
    time: "10:14 AM",
    event: "Device registered",
    device: "HR-LAP-1139",
    actor: "System",
    risk: "Low",
  },

  {
    time: "09:58 AM",
    event: "Remote session ended",
    device: "MKT-DESK-1087",
    actor: "Maya Patel",
    risk: "Low",
  },

  {
    time: "09:44 AM",
    event: "Policy blocked action",
    device: "OPS-LAP-1104",
    actor: "Risk Engine",
    risk: "High",
  },
];

export const incidents: Incident[] = [
  {
    id: "INC-2048",
    title: "DNS resolution failure",
    device: "FIN-LAP-1042",
    risk: "Medium",
    status: "Diagnosing",
  },

  {
    id: "INC-2047",
    title: "High CPU utilization",
    device: "ENG-LAP-1028",
    risk: "Low",
    status: "Remediation ready",
  },

  {
    id: "INC-2046",
    title: "Service unavailable",
    device: "CACHE-SRV-01",
    risk: "High",
    status: "Awaiting approval",
  },
];