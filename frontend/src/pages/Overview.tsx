import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Monitor, BookOpen, Clock, Globe, Users, ArrowRight } from 'lucide-react';
import { useDevices } from '../hooks/useDevices';
import { api } from '../api/client';
import { usersApi } from '../api/users';
import { domainsApi } from '../api/domains';
import { useCan } from '../lib/permissions';
import { formatTimestamp } from '../lib/format';

interface CronJob { id: number; name: string; enabled: number; last_run: number | null; last_status: string | null; }

export default function Overview() {
  const canCommands = useCan('commands');
  const canCron = useCan('cron');
  const canDomains = useCan('manage_domains');
  const canUsers = useCan('manage_users');

  const { data: devices = [] } = useDevices();
  const { data: commands = [] } = useQuery<{ id: number }[]>({
    queryKey: ['commands'], queryFn: () => api.get('/commands').then(r => r.data), enabled: canCommands,
  });
  const { data: cron = [] } = useQuery<CronJob[]>({
    queryKey: ['cron'], queryFn: () => api.get('/cron').then(r => r.data), enabled: canCron,
  });
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: usersApi.list, enabled: canUsers });
  const { data: domains = [] } = useQuery({ queryKey: ['domains'], queryFn: domainsApi.list, enabled: canDomains });

  const linux = devices.filter(d => d.os_type === 'linux').length;
  const windows = devices.filter(d => d.os_type === 'windows').length;
  const cronEnabled = cron.filter(j => j.enabled).length;
  const cronFailing = cron.filter(j => j.last_status === 'error').length;
  const admins = users.filter(u => u.role === 'admin').length;
  const recentCron = [...cron].filter(j => j.last_run).sort((a, b) => b.last_run! - a.last_run!).slice(0, 5);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-white mb-6">Overview</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard to="/devices" icon={Monitor} label="Devices" value={devices.length} sub={`${linux} Linux · ${windows} Windows`} />
        {canCommands && <StatCard to="/commands" icon={BookOpen} label="Saved commands" value={commands.length} />}
        {canCron && (
          <StatCard
            to="/cron" icon={Clock} label="Cron jobs" value={cron.length}
            sub={`${cronEnabled} enabled${cronFailing ? ` · ${cronFailing} failing` : ''}`}
            subDanger={cronFailing > 0}
          />
        )}
        {canDomains && <StatCard to="/domains" icon={Globe} label="Domains" value={domains.length} />}
        {canUsers && <StatCard to="/users" icon={Users} label="Users" value={users.length} sub={`${admins} admin${admins === 1 ? '' : 's'}`} />}
      </div>

      {canCron && recentCron.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-gray-400 mb-3">Recent cron runs</h2>
          <div className="space-y-2">
            {recentCron.map(j => (
              <div key={j.id} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5">
                <span className={`w-2 h-2 rounded-full ${j.last_status === 'success' ? 'bg-green-400' : j.last_status === 'error' ? 'bg-red-400' : 'bg-gray-600'}`} />
                <span className="text-sm text-white flex-1 truncate">{j.name}</span>
                <span className="text-xs text-gray-500">{formatTimestamp(j.last_run)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ to, icon: Icon, label, value, sub, subDanger }: {
  to: string; icon: React.ElementType; label: string; value: number; sub?: string; subDanger?: boolean;
}) {
  return (
    <Link to={to} className="group bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-600 transition-colors">
      <div className="flex items-center justify-between">
        <div className="p-2 bg-gray-800 rounded-lg"><Icon size={18} className="text-blue-400" /></div>
        <ArrowRight size={16} className="text-gray-700 group-hover:text-gray-400 transition-colors" />
      </div>
      <div className="mt-4 text-3xl font-semibold text-white">{value}</div>
      <div className="text-sm text-gray-400">{label}</div>
      {sub && <div className={`text-xs mt-1 ${subDanger ? 'text-red-400' : 'text-gray-600'}`}>{sub}</div>}
    </Link>
  );
}
