from app.services.ofx_parser import parse_ofx_bytes


def test_parse_ofx_with_credit_and_debit() -> None:
    content = """
    OFXHEADER:100
    DATA:OFXSGML
    <OFX>
      <SIGNONMSGSRSV1>
        <SONRS>
          <FI>
            <ORG>Itau Empresas</ORG>
          </FI>
        </SONRS>
      </SIGNONMSGSRSV1>
      <BANKMSGSRSV1>
        <STMTTRNRS>
          <STMTRS>
            <BANKTRANLIST>
              <STMTTRN>
                <TRNAMT>1500.00
                <DTPOSTED>20260625
                <MEMO>PIX RECEBIDO CLIENTE X
              <STMTTRN>
                <TRNAMT>-89.90
                <DTPOSTED>20260625
                <NAME>PAGAMENTO FORNECEDOR
            </BANKTRANLIST>
          </STMTRS>
        </STMTTRNRS>
      </BANKMSGSRSV1>
    </OFX>
    """.encode("utf-8")

    parsed = parse_ofx_bytes(content, "extrato.ofx")

    assert parsed.banco == "Itau Empresas"
    assert parsed.summary.quantidade_movimentacoes == 2
    assert parsed.records[0].entrada == "1500.00"
    assert parsed.records[0].saida == ""
    assert parsed.records[1].entrada == ""
    assert parsed.records[1].saida == "89.90"


def test_parse_ofx_item_fallback() -> None:
    content = """
    <OFX>
      <BANKTRANLIST>
        <STMTTRN>
          <TRNAMT>10.00
          <DTPOSTED>20260626
          <FITID>ABC123
      </BANKTRANLIST>
    </OFX>
    """.encode("utf-8")

    parsed = parse_ofx_bytes(content, "fallback.ofx")

    assert parsed.records[0].item == "ABC123"
