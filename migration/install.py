#!/usr/bin/env python3
# migration/install.py
# Script para instalar dependências do sistema de migração

import subprocess
import sys
import os
from pathlib import Path

def install_requirements():
    """Instala dependências do requirements.txt"""
    requirements_file = Path(__file__).parent / "requirements.txt"
    
    if not requirements_file.exists():
        print("❌ Arquivo requirements.txt não encontrado")
        return False
    
    try:
        print("📦 Instalando dependências...")
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", "-r", str(requirements_file)
        ])
        print("✅ Dependências instaladas com sucesso!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Erro ao instalar dependências: {e}")
        return False

def check_database():
    """Verifica se o banco antigo existe"""
    old_db = Path(__file__).parent.parent / "database_old.sqlite"
    
    if old_db.exists():
        print(f"✅ Banco antigo encontrado: {old_db}")
        return True
    else:
        print(f"❌ Banco antigo não encontrado: {old_db}")
        print("   Certifique-se de que o arquivo database_old.sqlite existe no diretório raiz do projeto")
        return False

def check_api():
    """Verifica se a API está rodando"""
    try:
        import requests
        response = requests.get("http://localhost:1425/api/status", timeout=5)
        if response.status_code == 200:
            print("✅ API do sistema novo está funcionando")
            return True
        else:
            print(f"⚠️ API retornou status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Erro ao conectar com API: {e}")
        print("   Certifique-se de que o servidor está rodando em http://localhost:1425")
        return False

def main():
    """Função principal de instalação"""
    print("🚀 Instalador do Sistema de Migração NFC-e")
    print("=" * 50)
    
    # Instala dependências
    if not install_requirements():
        print("❌ Falha na instalação das dependências")
        return False
    
    print("\n🔍 Verificando configuração...")
    
    # Verifica banco antigo
    db_ok = check_database()
    
    # Verifica API
    api_ok = check_api()
    
    print("\n" + "=" * 50)
    
    if db_ok and api_ok:
        print("✅ Sistema pronto para migração!")
        print("\n📋 Comandos disponíveis:")
        print("   python migrate_sqlite.py --test          # Testa conexões")
        print("   python migrate_sqlite.py --dry-run       # Modo de teste")
        print("   python migrate_sqlite.py --limit 10      # Migra 10 notas")
        print("   python migrate_sqlite.py                 # Migra todas as notas")
    else:
        print("❌ Configuração incompleta. Verifique os erros acima.")
        return False
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
