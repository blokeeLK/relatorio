import { createClient, PostgrestError } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL e ANON KEY são obrigatórios. Configure o arquivo .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Traduz erros comuns do Supabase / PostgREST para mensagens
 * claras em português, com instruções de correção quando o
 * problema é de schema desatualizado.
 */
export function friendlySupabaseError(err: unknown): string {
  const pgErr = err as PostgrestError | { message?: string; code?: string }
  const msg = (pgErr?.message || '').toString()
  const code = (pgErr as { code?: string })?.code || ''

  // Schema cache desatualizado ou tabela/coluna inexistente
  if (/schema cache/i.test(msg) || code === 'PGRST205' || code === 'PGRST204') {
    const match = msg.match(/['"`]?public\.(\w+)['"`]?/i) || msg.match(/column ['"`]?(\w+)['"`]?/i)
    const target = match ? match[1] : 'tabela/coluna'
    return (
      `Banco de dados desatualizado: "${target}" não foi encontrado. ` +
      `Abra o Supabase → SQL Editor → rode o arquivo RODAR_NO_SUPABASE.sql do repositório ` +
      `e depois recarregue a página (Ctrl+F5).`
    )
  }

  // Violação de check constraint (ex: tamanho não permitido)
  if (code === '23514' || /check constraint/i.test(msg)) {
    return `Valor inválido para um dos campos. Detalhe: ${msg}`
  }

  // Violação de unique
  if (code === '23505' || /duplicate key/i.test(msg)) {
    return `Registro duplicado. Já existe um item com esses dados.`
  }

  // Foreign key
  if (code === '23503') {
    return `Referência inválida: o produto selecionado pode ter sido removido. Recarregue a página.`
  }

  return msg || 'Erro desconhecido ao comunicar com o banco.'
}
