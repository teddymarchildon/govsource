'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../utils/supabase/client';

export default function TestMethodsPage() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function runTests() {
      const testResults: any[] = [];
      const supabase = createClient();
      
      // Test 1: getSession (local storage/cookies)
      try {
        console.log('[TestMethods] Test 1: getSession');
        const start = Date.now();
        const { data, error } = await Promise.race([
          supabase.auth.getSession(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
        ]) as any;
        const duration = Date.now() - start;
        
        testResults.push({
          method: 'getSession()',
          success: !error,
          duration: `${duration}ms`,
          hasSession: !!data?.session,
          error: error?.message
        });
      } catch (err: any) {
        testResults.push({
          method: 'getSession()',
          success: false,
          error: err.message
        });
      }
      
      // Test 2: getUser (API call)
      try {
        console.log('[TestMethods] Test 2: getUser');
        const start = Date.now();
        const { data, error } = await Promise.race([
          supabase.auth.getUser(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
        ]) as any;
        const duration = Date.now() - start;
        
        testResults.push({
          method: 'getUser()',
          success: !error,
          duration: `${duration}ms`,
          hasUser: !!data?.user,
          userId: data?.user?.id,
          error: error?.message
        });
      } catch (err: any) {
        testResults.push({
          method: 'getUser()',
          success: false,
          error: err.message
        });
      }
      
      // Test 3: Direct database query
      try {
        console.log('[TestMethods] Test 3: Database query');
        const start = Date.now();
        const { data, error } = await Promise.race([
          supabase.from('user_usage').select('user_id').limit(1),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
        ]) as any;
        const duration = Date.now() - start;
        
        testResults.push({
          method: 'Database query',
          success: !error,
          duration: `${duration}ms`,
          data: data,
          error: error?.message
        });
      } catch (err: any) {
        testResults.push({
          method: 'Database query',
          success: false,
          error: err.message
        });
      }
      
      // Test 4: Check if auth is initialized
      try {
        console.log('[TestMethods] Test 4: Auth initialized check');
        // @ts-ignore - accessing internal property for debugging
        const isInitialized = supabase.auth.initialized;
        const hasStorage = typeof window !== 'undefined' && window.localStorage;
        
        testResults.push({
          method: 'Auth initialization check',
          success: true,
          isInitialized,
          hasStorage,
          // @ts-ignore
          authUrl: supabase.auth.url,
          // @ts-ignore
          hasHeaders: !!supabase.auth.headers
        });
      } catch (err: any) {
        testResults.push({
          method: 'Auth initialization check',
          success: false,
          error: err.message
        });
      }
      
      setResults(testResults);
      setLoading(false);
    }
    
    runTests();
  }, []);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Auth Methods Test</h1>
      
      <div className="space-y-4">
        {loading ? (
          <div className="bg-gray-100 p-4 rounded">
            <p>Running tests...</p>
          </div>
        ) : (
          results.map((result, index) => (
            <div 
              key={index} 
              className={`p-4 rounded ${result.success ? 'bg-green-100' : 'bg-red-100'}`}
            >
              <h3 className="font-semibold">{result.method}</h3>
              <pre className="text-sm mt-2">{JSON.stringify(result, null, 2)}</pre>
            </div>
          ))
        )}
        
        <div className="bg-blue-100 p-4 rounded">
          <h2 className="font-semibold mb-2">What this tests:</h2>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li>getSession() - reads from local storage/cookies</li>
            <li>getUser() - makes API call to validate session</li>
            <li>Database query - tests if auth headers are sent</li>
            <li>Internal state - checks auth initialization</li>
          </ul>
        </div>
      </div>
    </div>
  );
} 