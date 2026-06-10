import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: Request) {
  // 1. Validar autenticación y rol de administrador
  const session = await getServerSession(authOptions);
  
  if (!session || (session.user as any).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acceso no autorizado.' }, { status: 401 });
  }

  // 2. Obtener credenciales de Supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    return NextResponse.json(
      { error: 'Configuración de almacenamiento incompleta en el servidor.' },
      { status: 500 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se envió ningún archivo.' }, { status: 400 });
    }

    // 3. Leer archivo en buffer de Node
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 4. Preparar metadatos y nombre del archivo
    const timestamp = Date.now();
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const bucketName = 'course-images';
    const filePath = `uploads/${timestamp}_${cleanFileName}`;

    // URL de subida REST de Supabase Storage
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucketName}/${filePath}`;

    // 5. Enviar el archivo mediante fetch nativo
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': file.type,
        'x-upsert': 'true',
      },
      body: buffer,
    });

    if (!uploadRes.ok) {
      const errorText = await uploadRes.text();
      console.error('Error subiendo archivo a Supabase Storage:', errorText);
      return NextResponse.json(
        { error: 'Hubo un problema al guardar la imagen en el almacenamiento.' },
        { status: 500 }
      );
    }

    // 6. Generar URL pública
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${filePath}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
    });
  } catch (error: any) {
    console.error('Error en API Route /api/upload:', error);
    return NextResponse.json({ error: error.message || 'Error interno al procesar el archivo.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  // 1. Validar autenticación y rol de administrador
  const session = await getServerSession(authOptions);
  
  if (!session || (session.user as any).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acceso no autorizado.' }, { status: 401 });
  }

  // 2. Obtener credenciales de Supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    return NextResponse.json(
      { error: 'Configuración de almacenamiento incompleta en el servidor.' },
      { status: 500 }
    );
  }

  try {
    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ error: 'No se especificó la URL a eliminar.' }, { status: 400 });
    }

    const bucketName = 'course-images';
    const marker = `/public/${bucketName}/`;
    const index = url.indexOf(marker);
    if (index === -1) {
      return NextResponse.json({ error: 'La URL no pertenece al almacenamiento de este proyecto.' }, { status: 400 });
    }

    const filePath = url.substring(index + marker.length);
    const deleteUrl = `${supabaseUrl}/storage/v1/object/${bucketName}/${filePath}`;

    const deleteRes = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
    });

    if (!deleteRes.ok) {
      const errorText = await deleteRes.text();
      console.error('Error eliminando de Supabase:', errorText);
      return NextResponse.json({ error: 'Error al eliminar el archivo físico en Supabase.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error en API Route /api/upload DELETE:', error);
    return NextResponse.json({ error: error.message || 'Error interno.' }, { status: 500 });
  }
}
