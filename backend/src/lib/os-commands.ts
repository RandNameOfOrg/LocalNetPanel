/**
 * OS-specific shell commands for power control and system info collection.
 * Centralised here so Linux/Windows command strings live in one place and are
 * reused by both the power and info routes.
 */

export type OsType = 'linux' | 'windows';

const LINUX_INFO: Record<string, string> = {
  basic: 'hostname && ip addr show && uptime',
  cpu: "cat /proc/cpuinfo | grep -E 'model name|cpu MHz' | head -8",
  ram: 'free -m',
  gpu: 'nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null || echo "no_gpu"',
  uptime: 'uptime -p',
  processes: 'ps aux --sort=-%cpu | head -20',
  docker: 'docker ps --format "{{json .}}" 2>/dev/null || echo "no_docker"',
  network: 'ip addr show && ss -tunlp',
  disk: 'df -h',
};

const WINDOWS_INFO: Record<string, string> = {
  basic: 'hostname & ipconfig & net statistics workstation',
  cpu: 'wmic cpu get Name,CurrentClockSpeed /value',
  ram: 'wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /value',
  gpu: 'wmic path Win32_VideoController get Name,AdapterRAM /value',
  uptime: 'powershell -command "(Get-Date) - (gcim Win32_OperatingSystem).LastBootUpTime | Select-Object -ExpandProperty TotalHours"',
  processes: 'tasklist /FO LIST',
  docker: 'docker ps 2>nul || echo no_docker',
  network: 'ipconfig /all',
  disk: 'wmic logicaldisk get DeviceID,FreeSpace,Size /value',
};

/** The info categories supported by both platforms (used by the frontend tab list). */
export const INFO_TYPES = Object.keys(LINUX_INFO);

/** Resolve the shell command for a given OS + info type, or `undefined` if unknown. */
export function infoCommand(osType: OsType, type: string): string | undefined {
  return (osType === 'windows' ? WINDOWS_INFO : LINUX_INFO)[type];
}

/**
 * Build a shutdown/reboot command. `delay` is in seconds; Linux `shutdown`
 * only accepts whole minutes so it is rounded up.
 */
export function powerCommand(osType: OsType, action: 'shutdown' | 'reboot', delay: number): string {
  if (osType === 'windows') {
    return action === 'reboot' ? `shutdown /r /t ${delay}` : `shutdown /s /t ${delay}`;
  }
  const minutes = Math.ceil(delay / 60);
  if (action === 'reboot') return delay === 0 ? 'reboot' : `shutdown -r +${minutes}`;
  return delay === 0 ? 'shutdown -h now' : `shutdown -h +${minutes}`;
}
