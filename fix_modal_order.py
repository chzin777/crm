import sys
path = '/opt/crm/crm/app/page.tsx'
content = open(path).read()

# 1. Remove the misplaced block (lines ~196-227) that references cardDraft before declaration
old_misplaced = """  // Sync card draft when selectedCard changes
  React.useEffect(() => {
    if (selectedCard) {
      setCardDraft({
        telefone: selectedCard.telefone,
        email: selectedCard.email,
        dataNascimento: selectedCard.dataNascimento,
        titulo: selectedCard.titulo,
        valor: selectedCard.valor,
      });
      setDetailTab('dados');
      setIsSavingCard(false);
    }
  }, [selectedCard?.id]);

  const hasCardChanges = selectedCard ? (
    cardDraft.telefone !== selectedCard.telefone ||
    cardDraft.email !== selectedCard.email ||
    cardDraft.dataNascimento !== selectedCard.dataNascimento ||
    cardDraft.titulo !== selectedCard.titulo ||
    cardDraft.valor !== selectedCard.valor
  ) : false;

  const handleSaveCard = async () => {
    if (!selectedCard) return;
    setIsSavingCard(true);
    try {
      setCards((prev) => prev.map((c) => c.id === selectedCard.id ? { ...c, ...cardDraft } : c));
      setSelectedCard((prev) => prev ? { ...prev, ...cardDraft } : null);
    } finally { setIsSavingCard(false); }
  };

  const { data: cards"""

new_without_misplaced = """  const { data: cards"""

if old_misplaced not in content:
    print('MISPLACED_BLOCK_NOT_FOUND', file=sys.stderr)
    sys.exit(1)
content = content.replace(old_misplaced, new_without_misplaced, 1)

# 2. Insert the corrected block AFTER the isSavingCard state declaration
anchor = "const [isSavingCard, setIsSavingCard] = useState(false);"
insert_after = """const [isSavingCard, setIsSavingCard] = useState(false);
  useEffect(() => {
    if (selectedCard) {
      setCardDraft({
        telefone: selectedCard.telefone,
        email: selectedCard.email,
        dataNascimento: selectedCard.dataNascimento,
        titulo: selectedCard.titulo,
        valor: selectedCard.valor,
      });
      setDetailTab('dados');
      setIsSavingCard(false);
    }
  }, [selectedCard?.id]);
  const hasCardChanges = selectedCard ? (
    cardDraft.telefone !== selectedCard.telefone ||
    cardDraft.email !== selectedCard.email ||
    cardDraft.dataNascimento !== selectedCard.dataNascimento ||
    cardDraft.titulo !== selectedCard.titulo ||
    cardDraft.valor !== selectedCard.valor
  ) : false;
  const handleSaveCard = async () => {
    if (!selectedCard) return;
    setIsSavingCard(true);
    try {
      setCards((prev) => prev.map((c) => c.id === selectedCard.id ? { ...c, ...cardDraft } : c));
      setSelectedCard((prev) => prev ? { ...prev, ...cardDraft } : null);
    } finally { setIsSavingCard(false); }
  };"""

if anchor not in content:
    print('ANCHOR_NOT_FOUND', file=sys.stderr)
    sys.exit(1)
content = content.replace(anchor, insert_after, 1)

open(path, 'w').write(content)
print('OK')