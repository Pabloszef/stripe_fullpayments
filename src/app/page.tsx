"use client"

import { api } from "../../convex/_generated/api";
import {Card, CardContent, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import Link from "next/link";
import Image from "next/image";
import {Badge} from "@/components/ui/badge";
import {useQuery} from "convex/react";
import {ArrowRight, Loader2} from "lucide-react";
import {SignedIn, SignedOut, SignInButton} from "@clerk/nextjs";
import {Button} from "@/components/ui/button";
import PurchaseButton from "@/components/PurchaseButton";

export default function Home() {
    const courses = useQuery(api.courses.getCourses);

    if (courses === undefined) {
        return <div className="flex justify-center items-center h-[calc(100vh-6rem)]"><Loader2 className="animate-spin size-10" /></div>
    }
  return (
      <div className="flex min-h-screen flex-col">
          <main className="flex-grow container mx-auto px-4 py-16">
              <div className="text-center mb-16">
                  <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-4">
                      Forge Your Path in Modern Development
                  </h1>
                  <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                      Master fullstack skills through engaging, project-based learning. Unlock your potential with MasterClass.
                  </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
                  {courses.slice(0,3).map(course => (
                      <Card key={course._id} className="flex flex-col">
                          <Link href={`/courses/${course._id}`} className="cursor-pointer">
                              <CardHeader>
                                  <Image
                                      src={course.imageUrl}
                                      alt={course.title}
                                      width={640}
                                      height={360}
                                      className="rounded-md object-cover"
                                    />
                              </CardHeader>
                              <CardContent className="flex-grow flex-1">
                                  <CardTitle className="text-xl mb-2 hover:underline">{course.title}</CardTitle>
                              </CardContent>
                          </Link>

                          <CardFooter className="flex justify-between items-center mt-auto">
                              <Badge variant="default" className="text-lg px-3 py-1">
                                  ${course.price.toFixed(2)}
                              </Badge>

                          <SignedIn>
                              <PurchaseButton courseId={course._id}/>
                          </SignedIn>

                          <SignedOut>
                              <SignInButton mode="modal">
                                  <Button variant="outline">
                                      Enroll now
                                  </Button>
                              </SignInButton>
                          </SignedOut>
                          </CardFooter>
                      </Card>
                  ))}
              </div>

              <div className="text-center">
                  <Link href="/pro">
                      <Button size="lg" className="group hover:bg-purple-600 transition-colors duration-300">
                          Explore Pro Plans
                          <ArrowRight className="ml-2 size-4 group-hover:translate-x-1 transition-transform" />
                      </Button>
                  </Link>
              </div>
          </main>
      </div>
  );
}
