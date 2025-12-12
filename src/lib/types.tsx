import type { LogEvent } from '@/components/dashboard/cards/LogPlayerCard';

export type ServerAlert = {
    _id?: string;
    title: string;
    level: 'info' | 'warn' | 'danger';
    started_at: string;          // ISO
    filename_s?: string;
    filename_l?: string;
    model: string;
    sensor_id: string;

};

export function mapServerAlertToLogEvent(a: ServerAlert): LogEvent {
    return {
        id: a._id ?? `${a.title}-${a.started_at}`,
        title: a.title,
        timestamp: a.started_at,
        severity: a.level,
        // 필요시 파일명 -> 스트림 URL로 매핑
        filename: a.filename_l ? a.filename_l : a.filename_s ? a.filename_s : undefined,
        model: a.model,
        sensor_id: a.sensor_id
    };
}