-- Remover constraint única existente no CPF (se existir)
ALTER TABLE public.colaboradores DROP CONSTRAINT IF EXISTS colaboradores_cpf_key;

-- Criar índice único PARCIAL: só bloqueia CPF duplicado entre colaboradores ATIVOS
CREATE UNIQUE INDEX IF NOT EXISTS idx_colaboradores_cpf_ativo 
ON public.colaboradores (cpf) 
WHERE status = 'ativo' AND cpf IS NOT NULL;
