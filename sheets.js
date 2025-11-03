/**
 * Módulo de integración con Google Sheets
 * Gestiona la obtención y parseo de datos desde Google Sheets públicas
 */

// Configuración de las hojas de Google Sheets
const SHEETS_CONFIG = {
  // ID ÚNICO de la hoja de cálculo (TODAS las pestañas están en este mismo documento)
  SHEET_ID: '1j-IaOHXoLEP4bK2hjdn2uAYy8a2chqiQSOw4Nfxoyxc',

  // =================================================================
  // ¡¡¡ IMPORTANTE !!!
  // Pega aquí el GID de tu nueva hoja "Jornales_Historico"
  // Lo encuentras en la URL de tu Google Sheet al hacer clic en esa pestaña.
  GID_JORNALES: '418043978', // <-- REEMPLAZA ESTE NÚMERO
  // =================================================================
  
  // URLs completas para datos que no están en el SHEET_ID principal (o para mayor robustez)
  // URL de Contrataciones que se usa en getContrataciones
  URL_CONTRATACIONES_CSV: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSTtbkA94xqjf81lsR7bLKKtyES2YBDKs8J2T4UrSEan7e5Z_eaptShCA78R1wqUyYyASJxmHj3gDnY/pub?gid=1388412839&single=true&output=csv',

  URL_PUERTAS_CSV: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQrQ5bGZDNShEWi1lwx_l1EvOxC0si5kbN8GBxj34rF0FkyGVk6IZOiGk5D91_TZXBHO1mchydFvvUl/pub?gid=3770623&single=true&output=csv',
  
  URL_CENSO_LIMPIO: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTcJ5Irxl93zwDqehuLW7-MsuVtphRDtmF8Rwp-yueqcAYRfgrTtEdKDwX8WKkJj1m0rVJc8AncGN_A/pub?gid=1216182924&single=true&output=csv'
};

/**
 * Parsea CSV a array de objetos
 */
function parseCSV(csv) {
  if (!csv || csv.trim() === '') {
    return [];
  }

  const lines = csv.split('\n').filter(line => line.trim() !== '');
  if (lines.length === 0) return [];

  // Reemplazar comillas dobles al inicio/fin del header y limpiar espacios
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    const row = {};
    headers.forEach((header, index) => {
      // Asegurarse de que el número de valores no sea menor que el de cabeceras
      row[header] = values[index] !== undefined ? values[index] : ''; 
    });
    data.push(row);
  }

  return data;
}

/**
 * Parsea una línea CSV manejando comillas y comas dentro de campos
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Obtiene datos de una hoja (Usado por getJornales)
 */
async function fetchSheetData(sheetId, gid, useCache = true) {
  const cacheKey = `sheet_${sheetId}_${gid}`;
  const cacheTimeKey = `sheet_${sheetId}_${gid}_time`;
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

  // Verificar cache
  if (useCache) {
    const cached = localStorage.getItem(cacheKey);
    const cacheTime = localStorage.getItem(cacheTimeKey);

    if (cached && cacheTime) {
      const age = Date.now() - parseInt(cacheTime);
      if (age < CACHE_DURATION) {
        return JSON.parse(cached);
      }
    }
  }

  try {
    const url = getSheetCSVUrl(sheetId, gid);
    const response = await fetch(url, {
      headers: {
        'Accept-Charset': 'utf-8'
      },
      cache: 'no-store' // Forzar a no cachear, ya que tenemos el nuestro
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Asegurar lectura UTF-8
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('utf-8');
    const csv = decoder.decode(buffer);
    const data = parseCSV(csv);

    // Guardar en cache
    localStorage.setItem(cacheKey, JSON.stringify(data));
    localStorage.setItem(cacheTimeKey, Date.now().toString());

    return data;
  } catch (error) {
    console.error('Error fetching sheet data:', error);

    // Intentar devolver datos en cache aunque estén expirados
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      console.warn('Usando datos en cache expirados debido a error en la carga');
      return JSON.parse(cached);
    }

    throw error;
  }
}

/**
 * Construye la URL para obtener datos en formato CSV
 */
function getSheetCSVUrl(sheetId, gid) {
  // Usamos el ID de la hoja principal para construir la URL base
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}


/**
 * API principal para obtener datos
 */
const SheetsAPI = {
  /**
   * Obtiene las puertas desde CSV directo
   * (Versión frágil pero funcional, restaurada)
   */
  async getPuertas() {
    try {
      const puertasURL = SHEETS_CONFIG.URL_PUERTAS_CSV;

      const response = await fetch(puertasURL, {
        headers: {
          'Accept-Charset': 'utf-8'
        },
        cache: 'no-store' // Evitar caché del navegador
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      const decoder = new TextDecoder('utf-8');
      const csvText = decoder.decode(buffer);

      const lines = csvText.split('\n').map(l => l.trim()).filter(l => l !== '');
      const jornadasOrdenadas = ['02-08', '08-14', '14-20', '20-02', 'Festivo'];
      const primeraPuertaPorJornada = {};
      const segundaPuertaPorJornada = {};
      jornadasOrdenadas.forEach(j => {
        primeraPuertaPorJornada[j] = '';
        segundaPuertaPorJornada[j] = '';
      });

      let fecha = '';
      for (let idx = 0; idx < Math.min(5, lines.length) && !fecha; idx++) {
        const line = lines[idx];
        const columns = line.split(',').map(c => c.trim().replace(/"/g, ''));
        for (const col of columns) {
          if (col && /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(col)) {
            const parts = col.split('/');
            const dia = parts[0].padStart(2, '0');
            const mes = parts[1].padStart(2, '0');
            let anio = parts[2];
            if (anio.length === 2) anio = '20' + anio;
            fecha = `${dia}/${mes}/${anio}`;
            break;
          }
        }
      }

      for (const line of lines) {
        if (line.includes('No se admiten') || line.includes('!!')) continue;
        const columns = line.split(',').map(c => c.trim().replace(/"/g, ''));
        if (columns.length < 7) continue;
        const rawJornada = columns[2];
        if (!rawJornada) continue;
        let jornada = rawJornada.replace(/\s+.*/, '');
        if (jornadasOrdenadas.includes(jornada)) {
          const primeraPuerta = columns[3];
          if (primeraPuerta && primeraPuerta !== '' && primeraPuertaPorJornada[jornada] === '') {
            primeraPuertaPorJornada[jornada] = primeraPuerta;
          }
          const segundaPuerta = columns[4];
          if (segundaPuerta && segundaPuerta !== '' && segundaPuertaPorJornada[jornada] === '') {
            segundaPuertaPorJornada[jornada] = segundaPuerta;
          }
        }
      }

      const puertas = jornadasOrdenadas.map(jornada => ({
        jornada: jornada,
        puertaSP: primeraPuertaPorJornada[jornada],
        puertaOC: segundaPuertaPorJornada[jornada]
      }));

      return {
        fecha: fecha || new Date().toLocaleDateString('es-ES'),
        puertas: puertas
      };
    } catch (error) {
      console.error('Error obteniendo puertas (LÓGICA ANTIGUA):', error);
      return this.getMockPuertas();
    }
  },

  /**
   * Obtiene las asignaciones/contrataciones desde CSV directo
   * (Versión robusta, lee por cabeceras)
   */
  async getContrataciones(chapa = null) {
    const cacheKey = 'contrataciones_data';
    const cacheTimeKey = 'contrataciones_time';
    const CACHE_DURATION = 5 * 60 * 1000;

    const cached = localStorage.getItem(cacheKey);
    const cacheTime = localStorage.getItem(cacheTimeKey);
    if (cached && cacheTime) {
      const age = Date.now() - parseInt(cacheTime);
      if (age < CACHE_DURATION) {
        console.log('Usando contrataciones desde caché');
        const data = JSON.parse(cached);
        return chapa ? data.filter(c => c.chapa === chapa.toString()) : data;
      }
    }

    try {
      const contratacionURL = SHEETS_CONFIG.URL_CONTRATACIONES_CSV;
      const response = await fetch(contratacionURL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const csvText = await response.text();
      const rawData = parseCSV(csvText);
      if (rawData.length === 0) throw new Error('CSV vacío o sin cabeceras');

      const puestoMap = {
        'T': 'Trincador', 'TC': 'Trincador de Coches', 'C1': 'Conductor de 1a',
        'B': 'Conductor de Coches', 'E': 'Especialista'
      };
      const output = [];

      rawData.forEach(row => {
        const cleanRow = {};
        for (const key in row) {
            const cleanKey = key.replace(/\r/g, '');
            cleanRow[cleanKey] = row[key];
        }
        const baseData = {
          fecha: cleanRow['Fecha'] || '', jornada: cleanRow['Jornada'] || '',
          empresa: cleanRow['Empresa'] || '', parte: cleanRow['Parte'] || '',
          buque: cleanRow['Buque'] || ''
        };
        for (const [colKey, puestoNombre] of Object.entries(puestoMap)) {
          const chapaValue = cleanRow[colKey]; 
          if (chapaValue && chapaValue.trim() !== '') {
            const chapas = chapaValue.split(/[\s,]+/).filter(c => c.trim() !== '');
            chapas.forEach(chapa => {
                 output.push({
                  ...baseData,
                  chapa: chapa.replace(/\r/g, ''),
                  puesto: puestoNombre,
              });
            });
          }
        }
      });
      
      localStorage.setItem(cacheKey, JSON.stringify(output));
      localStorage.setItem(cacheTimeKey, Date.now().toString());

      if (chapa) {
        return output.filter(c => c.chapa === chapa.toString());
      }
      return output;
    } catch (error) {
      console.error('Error obteniendo contrataciones:', error);
      const cachedData = localStorage.getItem(cacheKey);
      if (cachedData) {
          console.warn('Usando datos de contrataciones en caché expirados');
          const data = JSON.parse(cachedData);
          return chapa ? data.filter(c => c.chapa === chapa.toString()) : data;
      }
      return this.getMockContrataciones(chapa);
    }
  },

  
  /**
   * Obtiene el censo de disponibilidad
   * (Versión robusta, lee desde URL limpia)
   */
  async getCenso() {
    const cacheKey = 'censo_limpio_data';
    const cacheTimeKey = 'censo_limpio_time';
    const CACHE_DURATION = 5 * 60 * 1000; 

    const cached = localStorage.getItem(cacheKey);
    const cacheTime = localStorage.getItem(cacheTimeKey);
    if (cached && cacheTime) {
      const age = Date.now() - parseInt(cacheTime);
      if (age < CACHE_DURATION) {
        console.log('Usando censo desde caché');
        return JSON.parse(cached);
      }
    }

    try {
      const response = await fetch(SHEETS_CONFIG.URL_CENSO_LIMPIO, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const buffer = await response.arrayBuffer();
      const decoder = new TextDecoder('utf-8');
      const csvText = decoder.decode(buffer);
      const data = parseCSV(csvText);
      
      const censoItems = data.map(item => {
        let colorName;
        const colorVal = item.color ? item.color.replace(/\r/g, '') : '';
        const colorNum = parseInt(colorVal);
        switch (colorNum) {
          case 4: colorName = 'green'; break; case 3: colorName = 'blue'; break;
          case 2: colorName = 'yellow'; break; case 1: colorName = 'orange'; break;
          case 0: colorName = 'red'; break; default: colorName = 'green';
        }
        return {
          posicion: parseInt(item.posicion),
          chapa: item.chapa, 
          color: colorName
        };
      }).filter(item => item.chapa && item.color && !isNaN(item.posicion));

      localStorage.setItem(cacheKey, JSON.stringify(censoItems));
      localStorage.setItem(cacheTimeKey, Date.now().toString());
      return censoItems;
    } catch (error) {
      console.error('Error obteniendo censo (nuevo método):', error);
      if (cached) {
        console.warn('Usando censo de caché expirado por error');
        return JSON.parse(cached);
      }
      throw new Error('No se pudo cargar el censo.');
    }
  },

  /**
   * Obtiene la posición de una chapa específica en el censo
   */
  async getPosicionChapa(chapa) {
    try {
      const censo = await this.getCenso();
      const item = censo.find(c => c.chapa === chapa);
      return item ? item.posicion : null;
    } catch (error) {
      console.error('Error obteniendo posición de chapa:', error);
      return null;
    }
  },

  /**
   * Calcula posiciones hasta contratación
   */
  async getPosicionesHastaContratacion(chapa) {
    try {
      const posicionUsuario = await this.getPosicionChapa(chapa);
      if (!posicionUsuario) return null;

      const LIMITE_SP = 449, INICIO_OC = 450, FIN_OC = 535;
      const esUsuarioSP = posicionUsuario <= LIMITE_SP;

      const puertasResult = await this.getPuertas();
      const puertas = puertasResult.puertas; 

      const puertasSP = puertas.map(p => parseInt(p.puertaSP)).filter(n => !isNaN(n) && n > 0);
      const puertasOC = puertas.map(p => parseInt(p.puertaOC)).filter(n => !isNaN(n) && n > 0);

      let posicionesFaltantes;
      if (esUsuarioSP) {
        if (puertasSP.length === 0) return null;
        const ultimaPuertaSP = Math.max(...puertasSP);
        posicionesFaltantes = (posicionUsuario > ultimaPuertaSP) ?
          (posicionUsuario - ultimaPuertaSP) :
          (LIMITE_SP - ultimaPuertaSP) + posicionUsuario;
      } else {
        if (puertasOC.length === 0) return null;
        const ultimaPuertaOC = Math.max(...puertasOC);
        posicionesFaltantes = (posicionUsuario > ultimaPuertaOC) ?
          (posicionUsuario - ultimaPuertaOC) :
          (FIN_OC - ultimaPuertaOC) + (posicionUsuario - INICIO_OC + 1);
      }
      return posicionesFaltantes;
    } catch (error) {
      console.error('Error calculando posiciones hasta contratación:', error);
      return null;
    }
  },

  /**
   * Obtiene mensajes del foro desde Google Sheet
   * (Versión robusta, lee por cabeceras)
   */
  async getForoMensajes() {
    try {
      const foroURL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTcJ5Irxl93zwDqehuLW7-MsuVtphRDtmF8Rwp-yueqcAYRfgrTtEdKDwX8WKkJj1m0rVJc8AncGN_A/pub?gid=464918425&single=true&output=csv';
      const response = await fetch(foroURL, { cache: 'no-store' });
      if (!response.ok) {
        console.warn('⚠️ Foro sheet no disponible (HTTP ' + response.status + ').');
        return null;
      }
      const csvText = await response.text();
      
      // Usar parseCSV genérico
      const data = parseCSV(csvText);

      return data.map((row, index) => {
        const timestamp = row.Timestamp || row.timestamp;
        const chapa = row.Chapa || row.chapa;
        const texto = row.Texto || row.texto;

        let parsedDate = new Date(timestamp);
        const id = parsedDate.getTime() && !isNaN(parsedDate.getTime())
          ? parsedDate.getTime()
          : Date.now() - index * 1000;

        return {
          id: id,
          timestamp: timestamp,
          chapa: chapa,
          texto: texto
        };
      }).filter(m => m.timestamp && m.chapa && m.texto); // Filtrar filas inválidas

    } catch (error) {
      console.error('❌ Error obteniendo mensajes del foro:', error);
      return null;
    }
  },

  /**
   * Envía un mensaje al foro usando Google Apps Script
   */
  async enviarMensajeForo(chapa, texto) {
    try {
      let appsScriptURL = localStorage.getItem('foro_apps_script_url');
      if (!appsScriptURL || appsScriptURL === '' || appsScriptURL === 'null') {
        appsScriptURL = 'https://script.google.com/macros/s/AKfycbwL1lFFIbpq4evkRQ6W7MTfF6ywWgWaNad6mphwLHRbGkrbSXlB4eUOm-oaB50dcDnQ8g/exec';
        localStorage.setItem('foro_apps_script_url', appsScriptURL);
      }
      await fetch(appsScriptURL, {
        method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addMessage', chapa: chapa, texto: texto,
          timestamp: new Date().toISOString()
        })
      });
      return true;
    } catch (error) {
      console.error('Error enviando mensaje al foro:', error);
      return false;
    }
  },

  /**
   * Obtiene usuarios desde Google Sheet para validación de login
   * (Versión robusta, lee por cabeceras)
   */
  async getUsuarios() {
    try {
      const usuariosURL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTcJ5Irxl93zwDqehuLW7-MsuVtphRDtmF8Rwp-yueqcAYRfgrTtEdKDwX8WKkJj1m0rVJc8AncGN_A/pub?gid=1704760412&single=true&output=csv';
      const response = await fetch(usuariosURL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const buffer = await response.arrayBuffer();
      const decoder = new TextDecoder('utf-8');
      const csvText = decoder.decode(buffer);
      
      const data = parseCSV(csvText);

      return data.map(row => {
        const chapa = row.Chapa || row.chapa;
        const contrasena = row.Contraseña || row.contraseña || row.Contrasena || row.contrasena;
        const nombre = row.Nombre || row.nombre;
        return {
          chapa: chapa,
          contrasena: contrasena,
          nombre: nombre || `Chapa ${chapa}`
        };
      }).filter(u => u.chapa && u.contrasena); // Filtrar usuarios inválidos
    } catch (error) {
      console.error('Error obteniendo usuarios:', error);
      return [];
    }
  },

  /**
   * Obtiene el nombre de un usuario por su chapa
   */
  async getNombrePorChapa(chapa) {
    try {
      const usuariosCache = JSON.parse(localStorage.getItem('usuarios_cache') || '{}');
      if (usuariosCache[chapa]) {
        return usuariosCache[chapa];
      }
      const usuarios = await this.getUsuarios();
      const usuario = usuarios.find(u => u.chapa === chapa);
      if (usuario && usuario.nombre) {
        usuariosCache[chapa] = usuario.nombre;
        localStorage.setItem('usuarios_cache', JSON.stringify(usuariosCache));
        return usuario.nombre;
      }
      return `Chapa ${chapa}`;
    } catch (error) {
      console.error('Error obteniendo nombre:', error);
      return `Chapa ${chapa}`;
    }
  },

  /**
   * Obtiene TODOS los jornales de un estibador
   * (MODIFICADO: Lee del GID_JORNALES configurado)
   */
  async getJornales(chapa) {
    try {
      // Usa fetchSheetData, que lee por cabecera y usa caché
      const data = await fetchSheetData(SHEETS_CONFIG.SHEET_ID, SHEETS_CONFIG.GID_JORNALES);

      // Filtrar TODOS los registros por chapa
      const jornalesChapa = data.filter(row => {
        const rowChapa = (row.Chapa || row.chapa || '').toString().trim();
        return rowChapa === chapa.toString().trim();
      }).map(row => ({
        // Mapear por cabecera
        fecha: row.Fecha || row.fecha || '',
        puesto: row.Puesto || row.puesto || '',
        jornada: row.Jornada || row.jornada || '',
        empresa: row.Empresa || row.empresa || '',
        buque: row.Buque || row.buque || '',
        parte: row.Parte || row.parte || ''
      })).filter(item => item.fecha); // Filtrar filas sin fecha

      return jornalesChapa;
    } catch (error) {
      console.error('Error obteniendo jornales:', error);
      return [];
    }
  },

  // --- SECCIÓN DE DATOS MOCK (FALLBACKS) ---

  getMockPuertas() {
    console.warn("--- USANDO DATOS MOCK PARA PUERTAS ---");
    return {
      fecha: new Date().toLocaleDateString('es-ES'),
      puertas: [
        { jornada: '02-08', puertaSP: '153', puertaOC: '498' },
        { jornada: '08-14', puertaSP: '153', puertaOC: '498' },
        { jornada: '14-20', puertaSP: '', puertaOC: '' },
        { jornada: '20-02', puertaSP: '', puertaOC: '' },
        { jornada: 'Festivo', puertaSP: '173', puertaOC: '528' }
      ]
    };
  },
  getMockContrataciones(chapa = null) {
    console.warn("--- USANDO DATOS MOCK PARA CONTRATACIÓN ---");
    const today = new Date().toLocaleDateString('es-ES');
    const allData = [
      { fecha: today, chapa: '221', puesto: 'Conductor de 1ª', jornada: '20-02', empresa: 'APM', buque: 'ODYSSEUS', parte: '1' },
      { fecha: today, chapa: '330', puesto: 'Conductor de 1ª', jornada: '20-02', empresa: 'APM', buque: 'ODYSSEUS', parte: '1' },
      { fecha: today, chapa: '190', puesto: 'Especialista', jornada: '14-20', empresa: 'MSC', buque: 'MSC SARA', parte: '2' }
    ];
    if (chapa) return allData.filter(c => c.chapa === chapa.toString());
    return allData;
  },
  getMockCenso() {
    console.error("--- ERROR: NO SE PUDO CARGAR CENSO, MOCK DESHABILITADO ---");
    throw new Error("El mock de Censo está deshabilitado. La carga real falló.");
  },
  getMockJornales(chapa) {
    console.warn("--- USANDO DATOS MOCK PARA JORNALES ---");
    return [{ chapa: chapa, quincena: 'Oct 1-15', jornales: 7, horas: 42, nocturnos: 2, festivos: 1 }];
  }
};

/**
 * Limpia el cache de datos
 */
function clearSheetsCache() {
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    // Limpiamos todo lo relacionado con sheets y datos
    if (key.startsWith('sheet_') || key.startsWith('censo_') || key.startsWith('puertas_') || key.startsWith('contrataciones_')) {
      localStorage.removeItem(key);
    }
  });
  console.log('Cache de sheets limpiado');
}

// Exponer API globalmente
window.SheetsAPI = SheetsAPI;
window.clearSheetsCache = clearSheetsCache;
