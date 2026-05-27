'use client';

import React, { useState, useEffect } from 'react';

interface CountdownProps {
  targetDate: Date | string;
}

export default function Countdown({ targetDate }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: false,
  });

  useEffect(() => {
    const target = new Date(targetDate).getTime();

    const calculateTime = () => {
      const now = new Date().getTime();
      const difference = target - now;

      if (difference <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds, isExpired: false });
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

  if (timeLeft.isExpired) {
    return (
      <div className="text-center py-4 bg-teal-50 text-teal-800 font-bold rounded-xl border border-teal-100 text-sm">
        ¡El taller está en vivo ahora mismo!
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-2 text-center">
      {/* Días */}
      <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
        <span className="block text-2xl font-extrabold text-teal-700">{timeLeft.days}</span>
        <span className="text-[10px] uppercase font-bold text-gray-400">Días</span>
      </div>
      {/* Horas */}
      <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
        <span className="block text-2xl font-extrabold text-teal-700">{timeLeft.hours}</span>
        <span className="text-[10px] uppercase font-bold text-gray-400">Horas</span>
      </div>
      {/* Minutos */}
      <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
        <span className="block text-2xl font-extrabold text-teal-700">{timeLeft.minutes}</span>
        <span className="text-[10px] uppercase font-bold text-gray-400">Min.</span>
      </div>
      {/* Segundos */}
      <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
        <span className="block text-2xl font-extrabold text-teal-700">{timeLeft.seconds}</span>
        <span className="text-[10px] uppercase font-bold text-gray-400">Seg.</span>
      </div>
    </div>
  );
}
