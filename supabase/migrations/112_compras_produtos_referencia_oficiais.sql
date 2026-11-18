-- =============================================================================
-- Migration 112: Cadastro de Produtos de Referência Oficiais da Rodo Point
-- (Etapa 4D - Gate 7 e Gate 8)
-- =============================================================================

DO $$
DECLARE
  v_ws_id UUID;
  v_forn_salgados UUID;
  v_forn_coca UUID;
  v_forn_coca_extra UUID;
  v_forn_ambev UUID;
  v_forn_ceasa1 UUID;
  v_forn_ceasa3 UUID;
  v_forn_pao UUID;
  v_forn_elma UUID;
  v_forn_sellpack UUID;
  v_forn_cafe UUID;
  v_forn_cigarros UUID;
BEGIN
  -- 1. Localizar Workspace Conta Rodo Point
  SELECT id INTO v_ws_id
    FROM public.workspaces
   WHERE nome ILIKE '%rodo%' OR id = '2af415b6-76aa-4134-8133-a9b405671c1c'
   LIMIT 1;

  IF v_ws_id IS NULL THEN
    RAISE NOTICE 'Workspace Rodo Point não encontrado, migração postergada.';
    RETURN;
  END IF;

  -- 2. Localizar IDs dos fornecedores no calendário
  SELECT id INTO v_forn_salgados FROM public.compras_fornecedores_calendario WHERE workspace_id = v_ws_id AND fornecedor_nome = 'Salgados' LIMIT 1;
  SELECT id INTO v_forn_coca FROM public.compras_fornecedores_calendario WHERE workspace_id = v_ws_id AND fornecedor_nome = 'Coca-Cola' LIMIT 1;
  SELECT id INTO v_forn_coca_extra FROM public.compras_fornecedores_calendario WHERE workspace_id = v_ws_id AND fornecedor_nome = 'Coca-Cola (Extra)' LIMIT 1;
  SELECT id INTO v_forn_ambev FROM public.compras_fornecedores_calendario WHERE workspace_id = v_ws_id AND fornecedor_nome = 'Ambev' LIMIT 1;
  SELECT id INTO v_forn_ceasa1 FROM public.compras_fornecedores_calendario WHERE workspace_id = v_ws_id AND fornecedor_nome = 'Ceasa' AND dia_semana = 1 LIMIT 1;
  SELECT id INTO v_forn_ceasa3 FROM public.compras_fornecedores_calendario WHERE workspace_id = v_ws_id AND fornecedor_nome = 'Ceasa' AND dia_semana = 3 LIMIT 1;
  SELECT id INTO v_forn_pao FROM public.compras_fornecedores_calendario WHERE workspace_id = v_ws_id AND fornecedor_nome = 'Pão de Queijo' LIMIT 1;
  SELECT id INTO v_forn_elma FROM public.compras_fornecedores_calendario WHERE workspace_id = v_ws_id AND fornecedor_nome = 'Elma Chips' LIMIT 1;
  SELECT id INTO v_forn_sellpack FROM public.compras_fornecedores_calendario WHERE workspace_id = v_ws_id AND fornecedor_nome = 'Sellpack' LIMIT 1;
  SELECT id INTO v_forn_cafe FROM public.compras_fornecedores_calendario WHERE workspace_id = v_ws_id AND fornecedor_nome = 'Café 3 Corações' LIMIT 1;
  SELECT id INTO v_forn_cigarros FROM public.compras_fornecedores_calendario WHERE workspace_id = v_ws_id AND fornecedor_nome = 'Cigarros' LIMIT 1;

  -- 3. Inserir Produtos de Referência (Salgados)
  INSERT INTO public.compras_produtos_referencia (workspace_id, fornecedor_id, fornecedor_nome, produto_nome, categoria, unidade_medida, quantidade_referencia, ativo)
  VALUES
    (v_ws_id, v_forn_salgados, 'Salgados', 'Coxinha', 'Salgados Fritos', 'unidade', 190, TRUE),
    (v_ws_id, v_forn_salgados, 'Salgados', 'Coxinha C/ Catupiry', 'Salgados Fritos', 'unidade', 210, TRUE),
    (v_ws_id, v_forn_salgados, 'Salgados', 'Kibe', 'Salgados Fritos', 'unidade', 40, TRUE),
    (v_ws_id, v_forn_salgados, 'Salgados', 'Enroladinho Presunto e Queijo', 'Salgados Fritos', 'unidade', 60, TRUE),
    (v_ws_id, v_forn_salgados, 'Salgados', 'Enroladinho Salsicha', 'Salgados Fritos', 'unidade', 40, TRUE),
    (v_ws_id, v_forn_salgados, 'Salgados', 'Risole Carne', 'Salgados Fritos', 'unidade', 30, TRUE),
    (v_ws_id, v_forn_salgados, 'Salgados', 'Risole Presunto e Queijo', 'Salgados Fritos', 'unidade', 30, TRUE),
    (v_ws_id, v_forn_salgados, 'Salgados', 'Empada Frango', 'Salgados Assados', 'unidade', 40, TRUE),
    (v_ws_id, v_forn_salgados, 'Salgados', 'Empada Palmito', 'Salgados Assados', 'unidade', 25, TRUE),
    (v_ws_id, v_forn_salgados, 'Salgados', 'Pão de Batata', 'Salgados Assados', 'unidade', 35, TRUE)
  ON CONFLICT DO NOTHING;

  -- 4. Inserir Produtos de Referência (Coca-Cola)
  INSERT INTO public.compras_produtos_referencia (workspace_id, fornecedor_id, fornecedor_nome, produto_nome, categoria, unidade_medida, quantidade_referencia, ativo)
  VALUES
    (v_ws_id, v_forn_coca, 'Coca-Cola', 'Coca 350ml original', 'Refrigerantes', 'caixa', 15, TRUE),
    (v_ws_id, v_forn_coca, 'Coca-Cola', 'Coca 350ml zero', 'Refrigerantes', 'caixa', 10, TRUE),
    (v_ws_id, v_forn_coca, 'Coca-Cola', 'Coca 200ml', 'Refrigerantes', 'fardo', 6, TRUE),
    (v_ws_id, v_forn_coca, 'Coca-Cola', 'Coca 2L pet', 'Refrigerantes', 'fardo', 8, TRUE),
    (v_ws_id, v_forn_coca, 'Coca-Cola', 'Coca 600ml', 'Refrigerantes', 'fardo', 5, TRUE),
    (v_ws_id, v_forn_coca, 'Coca-Cola', 'Fanta Laranja 350ml', 'Refrigerantes', 'caixa', 5, TRUE),
    (v_ws_id, v_forn_coca, 'Coca-Cola', 'Fanta Uva 350ml', 'Refrigerantes', 'caixa', 4, TRUE),
    (v_ws_id, v_forn_coca, 'Coca-Cola', 'Sprite 350ml', 'Refrigerantes', 'caixa', 4, TRUE),
    (v_ws_id, v_forn_coca, 'Coca-Cola', 'Schweppes Citrus 350ml', 'Refrigerantes', 'caixa', 4, TRUE),
    (v_ws_id, v_forn_coca, 'Coca-Cola', 'Suco Del Valle Uva lata', 'Sucos', 'caixa', 4, TRUE),
    (v_ws_id, v_forn_coca, 'Coca-Cola', 'Suco Del Valle Pêssego lata', 'Sucos', 'caixa', 4, TRUE),
    (v_ws_id, v_forn_coca, 'Coca-Cola', 'Monster ENERGY', 'Energéticos', 'caixa', 8, TRUE),
    (v_ws_id, v_forn_coca, 'Coca-Cola', 'Monster Mango Loco', 'Energéticos', 'caixa', 6, TRUE),
    (v_ws_id, v_forn_coca, 'Coca-Cola', 'Monster Ultra Paradise', 'Energéticos', 'caixa', 4, TRUE),
    (v_ws_id, v_forn_coca, 'Coca-Cola', 'Red Bull 250 ml', 'Energéticos', 'caixa', 8, TRUE),
    (v_ws_id, v_forn_coca, 'Coca-Cola', 'Red Bull 473 ml', 'Energéticos', 'caixa', 4, TRUE),
    (v_ws_id, v_forn_coca, 'Coca-Cola', 'Red Bull Sugarfree 250ml', 'Energéticos', 'caixa', 4, TRUE)
  ON CONFLICT DO NOTHING;

  -- 5. Inserir Produtos de Referência (Ambev)
  INSERT INTO public.compras_produtos_referencia (workspace_id, fornecedor_id, fornecedor_nome, produto_nome, categoria, unidade_medida, quantidade_referencia, ativo)
  VALUES
    (v_ws_id, v_forn_ambev, 'Ambev', 'Pepsi lata', 'Refrigerantes', 'caixa', 8, TRUE),
    (v_ws_id, v_forn_ambev, 'Ambev', 'Guaraná Antarctica lata', 'Refrigerantes', 'caixa', 12, TRUE),
    (v_ws_id, v_forn_ambev, 'Ambev', 'Guaraná Zero lata', 'Refrigerantes', 'caixa', 6, TRUE),
    (v_ws_id, v_forn_ambev, 'Ambev', 'Sukita Laranja lata', 'Refrigerantes', 'caixa', 4, TRUE),
    (v_ws_id, v_forn_ambev, 'Ambev', 'H2OH Limão 500ml', 'Águas e Chás', 'fardo', 6, TRUE),
    (v_ws_id, v_forn_ambev, 'Ambev', 'Cerveja Heineken Long Neck', 'Cervejas', 'caixa', 10, TRUE),
    (v_ws_id, v_forn_ambev, 'Ambev', 'Cerveja Stella Artois Long Neck', 'Cervejas', 'caixa', 6, TRUE),
    (v_ws_id, v_forn_ambev, 'Ambev', 'Cerveja Budweiser Long Neck', 'Cervejas', 'caixa', 6, TRUE),
    (v_ws_id, v_forn_ambev, 'Ambev', 'Cerveja Amstel lata', 'Cervejas', 'caixa', 8, TRUE),
    (v_ws_id, v_forn_ambev, 'Ambev', 'Água Mineral Sem Gás 500ml', 'Águas', 'fardo', 15, TRUE),
    (v_ws_id, v_forn_ambev, 'Ambev', 'Água Mineral Com Gás 500ml', 'Águas', 'fardo', 10, TRUE)
  ON CONFLICT DO NOTHING;

  -- 6. Inserir Produtos de Referência (Ceasa Balas e Doces)
  INSERT INTO public.compras_produtos_referencia (workspace_id, fornecedor_id, fornecedor_nome, produto_nome, categoria, unidade_medida, quantidade_referencia, ativo)
  VALUES
    (v_ws_id, v_forn_ceasa1, 'Ceasa', 'Trident Menta', 'Trident', 'display', 6, TRUE),
    (v_ws_id, v_forn_ceasa1, 'Ceasa', 'Trident Hortelã', 'Trident', 'display', 6, TRUE),
    (v_ws_id, v_forn_ceasa1, 'Ceasa', 'Trident Morango', 'Trident', 'display', 5, TRUE),
    (v_ws_id, v_forn_ceasa1, 'Ceasa', 'Trident Melancia', 'Trident', 'display', 5, TRUE),
    (v_ws_id, v_forn_ceasa1, 'Ceasa', 'Halls Preto Extra Forte', 'Halls', 'display', 8, TRUE),
    (v_ws_id, v_forn_ceasa1, 'Ceasa', 'Halls Cereja', 'Halls', 'display', 6, TRUE),
    (v_ws_id, v_forn_ceasa1, 'Ceasa', 'Halls Menta', 'Halls', 'display', 6, TRUE),
    (v_ws_id, v_forn_ceasa1, 'Ceasa', 'Mentos Fruit', 'Mentos', 'display', 5, TRUE),
    (v_ws_id, v_forn_ceasa1, 'Ceasa', 'Mentos Mint', 'Mentos', 'display', 5, TRUE),
    (v_ws_id, v_forn_ceasa1, 'Ceasa', 'Bala Freegells Menta', 'Balas', 'pacote', 4, TRUE),
    (v_ws_id, v_forn_ceasa1, 'Ceasa', 'Bala Butter Toffees', 'Balas', 'pacote', 4, TRUE),
    (v_ws_id, v_forn_ceasa1, 'Ceasa', 'Chocolate Snickers', 'Doces e Chocolates', 'display', 6, TRUE),
    (v_ws_id, v_forn_ceasa1, 'Ceasa', 'Chocolate KitKat', 'Doces e Chocolates', 'display', 6, TRUE),
    (v_ws_id, v_forn_ceasa1, 'Ceasa', 'Barra de Cereal Nutry', 'Doces e Chocolates', 'display', 4, TRUE)
  ON CONFLICT DO NOTHING;

  -- 7. Inserir Produtos de Referência (Pão de Queijo, Elma Chips, Sellpack, Café, Cigarros)
  INSERT INTO public.compras_produtos_referencia (workspace_id, fornecedor_id, fornecedor_nome, produto_nome, categoria, unidade_medida, quantidade_referencia, ativo)
  VALUES
    (v_ws_id, v_forn_pao, 'Pão de Queijo', 'Pão de Queijo Tradicional', 'Congelados', 'kg', 40, TRUE),
    (v_ws_id, v_forn_pao, 'Pão de Queijo', 'Pão de Queijo Recheado', 'Congelados', 'kg', 20, TRUE),
    (v_ws_id, v_forn_elma, 'Elma Chips', 'Doritos 84g', 'Salgadinhos', 'fardo', 15, TRUE),
    (v_ws_id, v_forn_elma, 'Elma Chips', 'Ruffles 76g', 'Salgadinhos', 'fardo', 12, TRUE),
    (v_ws_id, v_forn_elma, 'Elma Chips', 'Cheetos 75g', 'Salgadinhos', 'fardo', 10, TRUE),
    (v_ws_id, v_forn_elma, 'Elma Chips', 'Fandangos 75g', 'Salgadinhos', 'fardo', 8, TRUE),
    (v_ws_id, v_forn_elma, 'Elma Chips', 'Batata Lay''s Clássica 80g', 'Salgadinhos', 'fardo', 10, TRUE),
    (v_ws_id, v_forn_sellpack, 'Sellpack', 'Embalagem Pote 500ml', 'Descartáveis', 'fardo', 10, TRUE),
    (v_ws_id, v_forn_sellpack, 'Sellpack', 'Guardanapo Sachê', 'Descartáveis', 'caixa', 8, TRUE),
    (v_ws_id, v_forn_sellpack, 'Sellpack', 'Copo Descartável 200ml', 'Descartáveis', 'fardo', 12, TRUE),
    (v_ws_id, v_forn_sellpack, 'Sellpack', 'Canudo Embalado', 'Descartáveis', 'caixa', 4, TRUE),
    (v_ws_id, v_forn_cafe, 'Café 3 Corações', 'Café Grão Gourmet 1kg', 'Cafeteria', 'kg', 15, TRUE),
    (v_ws_id, v_forn_cafe, 'Café 3 Corações', 'Filtro Industrial 100un', 'Cafeteria', 'caixa', 4, TRUE),
    (v_ws_id, v_forn_cafe, 'Café 3 Corações', 'Café Tradicional 500g', 'Cafeteria', 'unidade', 10, TRUE),
    (v_ws_id, v_forn_cigarros, 'Cigarros', 'Marlboro Red', 'Tabacaria', 'pacote', 20, TRUE),
    (v_ws_id, v_forn_cigarros, 'Cigarros', 'Marlboro Gold', 'Tabacaria', 'pacote', 20, TRUE),
    (v_ws_id, v_forn_cigarros, 'Cigarros', 'L&M Red', 'Tabacaria', 'pacote', 15, TRUE),
    (v_ws_id, v_forn_cigarros, 'Cigarros', 'Chesterfield Blue', 'Tabacaria', 'pacote', 15, TRUE)
  ON CONFLICT DO NOTHING;

END;
$$;
