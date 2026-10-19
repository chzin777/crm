import oracledb from 'oracledb';

const config = {
  user: 'horus',
  password: 'horus',
  connectString: '172.30.20.100:1521/horus'
};

async function inspect() {
  let connection;
  try {
    connection = await oracledb.getConnection(config);
    console.log('=== CONEXAO OK ===');

    // 1. view_unidade_empresarial
    const r1 = await connection.execute(
      'SELECT * FROM view_unidade_empresarial WHERE ROWNUM = 1'
    );
    console.log('\n=== VIEW_UNIDADE_EMPRESARIAL COLUNAS ===');
    if (r1.rows && r1.rows.length > 0) {
      console.log(JSON.stringify(Object.keys(r1.rows[0]), null, 2));
      console.log('VALORES:', JSON.stringify(r1.rows[0], null, 2));
    } else {
      console.log('VAZIA');
    }

    // 2. tab_dados_dinamicos
    const r2 = await connection.execute(
      'SELECT * FROM tab_dados_dinamicos WHERE ROWNUM = 1'
    );
    console.log('\n=== TAB_DADOS_DINAMICOS COLUNAS ===');
    if (r2.rows && r2.rows.length > 0) {
      console.log(JSON.stringify(Object.keys(r2.rows[0]), null, 2));
      console.log('VALORES:', JSON.stringify(r2.rows[0], null, 2));
    } else {
      console.log('VAZIA');
    }

  } catch (err) {
    console.error('ERRO:', err.message);
  } finally {
    if (connection) await connection.close();
    console.log('\n=== FECHADO ===');
  }
}

inspect();