-- Migration 61: Contatos de Emergencia do Colaborador
ALTER TABLE public.colaboradores 
ADD COLUMN IF NOT EXISTS contato_emergencia_1 TEXT,
ADD COLUMN IF NOT EXISTS contato_emergencia_2 TEXT;
