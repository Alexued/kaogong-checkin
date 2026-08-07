export interface Task {
  id: string;
  title: string;
  type: 'daily' | 'deadline';
  /** daily 可设结束日；deadline 必填截止日。null 表示无 */
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  order: number;
  /** 每个应完成日期的目标数量。清单任务和含子任务的主任务固定为 1。 */
  target: number;
  /** 数量单位，最多 12 个 Unicode 字符；清单任务为空。 */
  unit: string;
}

export interface Checkin {
  id: string;
  /** 主任务 id，或子任务 id（子任务打卡直接记子任务 id） */
  taskId: string;
  /** 该任务"应完成"的日期（结转补卡时记原始日期） */
  date: string;
  createdAt: string;
  updatedAt: string;
  /** 取消打卡 = 软删除，便于同步合并 */
  deleted: boolean;
  /** 该原始日期已完成的数量。 */
  progress: number;
  /** 首次产生进度时复制的任务目标，后续编辑任务不会改写。 */
  targetSnapshot: number;
  /** 首次产生进度时复制的任务单位。 */
  unitSnapshot: string;
}

export interface Subtask {
  id: string;
  /** 所属主任务 id */
  taskId: string;
  title: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  planEndDate: string | null;
  theme: 'light' | 'dark';
  /** 标记的重要日（如考试日），null 表示未设置 */
  markDate?: string | null;
  updatedAt?: string;
}

export interface TimerLap {
  /** 距起点的累计时长 */
  elapsedMs: number;
  /** 距上一打点（或起点）的分段时长 */
  splitMs: number;
}

export interface TimerRecord {
  id: string;
  label: string;
  taskId: string | null;
  /** 开始日期（本地 yyyy-MM-dd） */
  date: string;
  startedAt: string;
  durationMs: number;
  laps: TimerLap[];
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  mode?: 'stopwatch' | 'countdown';
}

export interface DrillRecord {
  id: string;
  percent: number;
  userAnswer: string;
  correct: boolean;
  mode: 'full' | 'random';
  /** 同一场练习的分组 id */
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
}

export interface FormulaDrillRecord {
  id: string;
  /** 公式表常量的 key */
  formulaKey: string;
  /** 自评：记住了 / 没记住 */
  known: boolean;
  mode: 'full' | 'random';
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
}

export interface AppState {
  schemaVersion: 2;
  tasks: Task[];
  subtasks: Subtask[];
  checkins: Checkin[];
  timers: TimerRecord[];
  drills: DrillRecord[];
  formulaDrills: FormulaDrillRecord[];
  settings: Settings;
}

export interface SnapshotMessage {
  kind: 'snapshot';
  state: AppState;
}

export interface ServerInfo {
  name: string;
  httpPort: number;
  ips: string[];
  serverId?: string;
  pairingRequired?: boolean;
  protocolVersion?: number;
  stateSchemaVersion?: number;
  minimumClientStateSchemaVersion?: number;
  backupProtocolVersion?: number;
  backupFormatVersion?: number;
}

export type SyncEntity = 'task' | 'subtask' | 'checkin' | 'settings' | 'timer' | 'drill' | 'formulaDrill';
export interface SyncMessage {
  kind: 'upsert' | 'delete';
  entity: SyncEntity;
  payload: any;
  /** v2 servers echo this value in an ack. Older servers safely ignore it. */
  clientMutationId?: string;
}

export interface SyncAckMessage {
  kind: 'ack';
  clientMutationId: string;
  applied?: boolean;
  error?: string;
  protocolVersion?: number;
}

export type RemoteSyncMessage = SyncMessage | SnapshotMessage | SyncAckMessage;
