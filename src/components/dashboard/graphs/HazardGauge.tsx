import React, { useState, useEffect } from 'react';
import { Gauge, gaugeClasses } from '@mui/x-charts/Gauge';
import { Typography, Box } from '@mui/material';

type HazardGaugeProps = {
    title: string;
    value: number;                 // -1 => error
    valueBounds: [number, number]; // [주의, 위험]
    valueMax: number;
};

const settings: Partial<React.ComponentProps<typeof Gauge>> = {
    width: 150,
    height: 150,
    endAngle: 360,
    innerRadius: '75%',
    outerRadius: '100%',
};

const getGaugeColor = (v: number, [warn, danger]: [number, number]) =>
    v >= danger ? '#ff0000' : v >= warn ? '#ffb300' : '#52b202';

const HazardGauge: React.FC<HazardGaugeProps> = ({ title, value, valueBounds, valueMax }) => {
    const [currentValue, setCurrentValue] = useState<number>(value);
    useEffect(() => setCurrentValue(value), [value]);

    const isError = currentValue === -1 || Number.isNaN(currentValue);
    const clamped = Math.max(0, Math.min(Number.isFinite(currentValue) ? currentValue : 0, valueMax));
    const shownValue = isError ? 0 : clamped;

    return (
        <Box>
            <Gauge
                {...settings}
                cornerRadius="50%"
                value={shownValue}
                valueMax={valueMax}
                text={() => (isError ? 'ERR' : `${Math.round(shownValue)}%`)}
                aria-label={isError ? `${title} error` : `${title} ${shownValue} percent`}
                sx={(theme) => ({
                    [`& .${gaugeClasses.valueText}`]: { fontSize: 40 },
                    [`& .${gaugeClasses.valueArc}`]: {
                        fill: isError ? theme.palette.error.main : getGaugeColor(shownValue, valueBounds),
                    },
                    [`& .${gaugeClasses.referenceArc}`]: {
                        fill: isError ? theme.palette.error.light : theme.palette.text.disabled,
                        opacity: isError ? 0.6 : 1,
                    },
                })}
            />
            <Typography
                variant="h6"
                align="center"
                color={isError ? 'error' : 'inherit'}
            >
                {title}
            </Typography>
        </Box>
    );
};

export default HazardGauge;