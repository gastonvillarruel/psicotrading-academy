'use client';

import React, { useEffect, Suspense } from 'react';
import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { META_PIXEL_ID, isMetaPixelAvailable } from '@/lib/meta-pixel';

function MetaPixelNavigationTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Registrar PageView en cambios de ruta de Next.js
  useEffect(() => {
    if (isMetaPixelAvailable()) {
      window.fbq!('track', 'PageView');
    }
  }, [pathname, searchParams]);

  return null;
}

export default function MetaPixelScript() {
  if (!META_PIXEL_ID) {
    return null;
  }

  return (
    <>
      <Suspense fallback={null}>
        <MetaPixelNavigationTracker />
      </Suspense>
      <Script
        id="meta-pixel-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
            fbq('track', 'PageView');
          `,
        }}
      />
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}
